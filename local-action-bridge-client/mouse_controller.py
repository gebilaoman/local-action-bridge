#!/usr/bin/env python3
import sys
import json
import struct
import logging
import traceback
import os
import pyautogui
import time
import platform
import psutil
import datetime
from logging.handlers import RotatingFileHandler
from actions.init_action import InitAction
from actions.heartbeat_action import HeartbeatAction
from actions.exit_action import ExitAction
from actions.mouse_action import MouseMoveAction, MouseClickAction
from actions.generic_action import GenericAction

class MouseController:
    def __init__(self):
        pyautogui.FAILSAFE = False
        pyautogui.PAUSE = 0
        self.screen_width, self.screen_height = pyautogui.size()
        self.start_time = datetime.datetime.now()
        self.logger = self._setup_logger()
        self._log_system_info()  # 记录系统信息
        self.last_heartbeat = None
        self.running = False
        self.initialized = False
        self.window_info = None
        
        # 初始化action处理器
        self.action_handlers = {
            'init': InitAction(self),
            'heartbeat': HeartbeatAction(self),
            'mouse_move': MouseMoveAction(self),
            'mouse_click': MouseClickAction(self),
            'exit': ExitAction(self),
            'execute_actions': GenericAction(self)
        }

    def _setup_logger(self):
        """设置日志配置"""
        log_dir = '/tmp/local_action_bridge_logs'
        if not os.path.exists(log_dir):
            os.makedirs(log_dir)
            
        log_file = os.path.join(log_dir, 'native_messaging_detailed.log')
        
        # 设置rotating file handler，限制单个日志文件大小为10MB，保留最近5个日志文件
        handler = RotatingFileHandler(
            log_file,
            maxBytes=10*1024*1024,  # 10MB
            backupCount=5,
            encoding='utf-8'
        )
        
        formatter = logging.Formatter(
            '%(asctime)s - [%(process)d] - %(levelname)s - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        handler.setFormatter(formatter)
        
        logger = logging.getLogger(__name__)
        logger.setLevel(logging.DEBUG)
        logger.addHandler(handler)
        
        return logger
        
    def _log_system_info(self):
        """记录系统信息"""
        try:
            self.logger.info("=" * 50)
            self.logger.info("系统启动时间: %s", self.start_time.strftime("%Y-%m-%d %H:%M:%S"))
            self.logger.info("进程ID: %s", os.getpid())
            self.logger.info("Python版本: %s", sys.version)
            self.logger.info("操作系统: %s", platform.platform())
            self.logger.info("CPU核心数: %s", psutil.cpu_count())
            self.logger.info("内存总量: %.2f GB", psutil.virtual_memory().total / (1024**3))
            self.logger.info("屏幕分辨率: %dx%d", self.screen_width, self.screen_height)
            self.logger.info("工作目录: %s", os.getcwd())
            self.logger.info("=" * 50)
        except Exception as e:
            self.logger.error("记录系统信息时出错: %s", str(e))

    def _log_resource_usage(self):
        """记录资源使用情况"""
        try:
            process = psutil.Process()
            self.logger.info("内存使用: %.2f MB", process.memory_info().rss / (1024*1024))
            self.logger.info("CPU使用率: %.1f%%", process.cpu_percent())
        except Exception as e:
            self.logger.error("记录资源使用情况时出错: %s", str(e))

    def send_message(self, message):
        """向Chrome发送消息"""
        try:
            # heartbeat_response 不需要打印
            if message.get('action') != 'heartbeat_response':
                self.logger.debug(f"Preparing to send message: {message}")
            encoded_message = json.dumps(message).encode('utf-8')
            message_length = len(encoded_message)
            
            sys.stdout.buffer.write(struct.pack('I', message_length))
            sys.stdout.buffer.write(encoded_message)
            sys.stdout.buffer.flush()

            # heartbeat_response 不需要打印
            if message.get('action') != 'heartbeat_response':
                self.logger.debug(f"Successfully sent message: {message}")
        except BrokenPipeError:
            self.logger.info("Chrome has disconnected (broken pipe). Exiting...")
            sys.exit(0)  # Exit gracefully
        except Exception as e:
            self.logger.error(f"Error sending message: {e}")
            self.logger.error(traceback.format_exc())

    def read_message(self):
        """从Chrome读取消息"""
        try:
            text_length_bytes = sys.stdin.buffer.read(4)
            if len(text_length_bytes) == 0:
                # self.logger.warning("No data received")##不要打印，日志太多了
                return None
            
            text_length = struct.unpack('I', text_length_bytes)[0]
            if text_length > 1024 * 1024:
                self.logger.error(f"Message too large: {text_length}")
                return None
            
            text = sys.stdin.buffer.read(text_length)
            return json.loads(text.decode('utf-8'))
            
        except Exception as e:
            self.logger.error(f"Error reading message: {e}")
            self.logger.error(traceback.format_exc())
            return None

    def process_message(self, message):
        """处理接收到的消息"""
        if not message or 'action' not in message:
            return

        try:
            action = message['action']
            handler = self.action_handlers.get(action)
            
            if not handler:
                self.send_message({
                    "status": "error",
                    "message": f"Unknown action: {action}"
                })
                return
                
            # 如果未初始化且不是init操作，拒绝处理
            if not self.initialized and action != 'init':
                self.send_message({
                    "action": f"{action}_response",
                    "status": "error",
                    "message": "Not initialized"
                })
                return
            
            # 打印操作请求信息（排除心跳请求）
            if action != 'heartbeat':
                self.logger.info(f"收到操作请求: {action}")
                self.logger.debug(f"操作详情: {message}")
            
            # 在执行action前打印当前的last_heartbeat
            # if action == 'heartbeat':
            #     self.logger.debug(f"处理心跳前的last_heartbeat: {self.last_heartbeat}")
                
            # 执行对应的action处理器
            handler.execute(message)
            
            # 在执行action后再次打印last_heartbeat
            # if action == 'heartbeat':
            #     self.logger.debug(f"处理心跳后的last_heartbeat: {self.last_heartbeat}")
            
        except Exception as e:
            self.logger.error(f"Error processing action: {e}")
            self.send_message({
                "status": "error",
                "message": str(e)
            })

    def run(self):
        """主运行循环"""
        self.logger.info("Native Messaging Host 开始运行")
        self.running = True
        last_resource_log = time.time()
        
        try:
            while self.running:
                message = self.read_message()
                if message:
                    self.process_message(message)

                # 每5分钟记录一次资源使用情况
                current_time = time.time()
                if current_time - last_resource_log > 300:  # 5分钟
                    self._log_resource_usage()
                    last_resource_log = current_time

                # 只有在初始化后且收到过心跳才检查心跳
                if self.initialized and self.last_heartbeat is not None:
                    time_since_last_heartbeat = current_time - self.last_heartbeat
                    if time_since_last_heartbeat > 10:
                        self.logger.error("10秒未收到心跳信号，程序退出...")
                        self.logger.info("最后心跳时间: %s", datetime.datetime.fromtimestamp(self.last_heartbeat))
                        self.logger.info("运行总时长: %s", datetime.datetime.now() - self.start_time)
                        break
                    
        except KeyboardInterrupt:
            self.logger.info("收到键盘中断信号，程序正常退出")
        except Exception as e:
            self.logger.error("主循环发生致命错误:")
            self.logger.error("错误类型: %s", type(e).__name__)
            self.logger.error("错误信息: %s", str(e))
            self.logger.error("堆栈跟踪:\n%s", traceback.format_exc())
            self.logger.error("程序运行时长: %s", datetime.datetime.now() - self.start_time)
            self.send_message({"status": "error", "message": str(e)})
        finally:
            self._log_resource_usage()  # 记录最终的资源使用情况
            self.logger.info("程序运行总时长: %s", datetime.datetime.now() - self.start_time)
            self.logger.info("Native messaging host 正在关闭")
            sys.exit(0)

# def main():
#     controller = MouseController()
#     controller.run()
#
# if __name__ == '__main__':
#     main()
