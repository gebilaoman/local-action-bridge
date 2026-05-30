from .base_action import BaseAction
import time
import os
from util.window_util import get_window_info, getAllTitles


class InitAction(BaseAction):
    def execute(self, message):
        self.logger.info("开始执行初始化操作...")
        
        # 检查是否已经初始化
        self.logger.debug(f"【InitAction】controller.initialized: {self.controller.initialized}")
        self.logger.debug(f"【InitAction】controller.window_info: {self.controller.window_info}")
        
        # 检查是否有缓存的窗口信息
        cached_window_info = message.get('cached_window_info')
        if cached_window_info:
            self.logger.info(f"检测到缓存的窗口信息，使用缓存数据：{cached_window_info}")
            self.controller.window_info = cached_window_info
            self.controller.initialized = True
            
            response = {
                "action": "init_response",
                "status": "success",
                "pid": os.getpid(),
                "window_info": cached_window_info,
                "timestamp": time.time()
            }
            self.logger.debug(f"使用缓存窗口信息发送初始化成功响应: {response}")
            self.send_response(response)
            return

        if self.controller.initialized and self.controller.window_info:
            self.logger.info("检测到已经初始化，当作重连处理")
            response = {
                "action": "init_response",
                "status": "success",
                "pid": os.getpid(),
                "window_info": self.controller.window_info,
                "timestamp": time.time()
            }
            self.logger.debug(f"发送重连成功响应: {response}")
            self.send_response(response)
            return
            
        target_window_title = message.get('target_window_title') or message.get('window_title')
        if not target_window_title:
            self.send_response({
                "action": "init_response",
                "status": "error",
                "message": "target_window_title is required",
                "pid": os.getpid(),
                "timestamp": time.time()
            })
            return

        self.logger.debug("正在获取所有窗口标题...")
        self.logger.debug(f"所有窗口标题: {getAllTitles()}")

        self.logger.debug(f"正在查找目标窗口: {target_window_title}")
        window_info = get_window_info(target_window_title)
        if not window_info:
            self.logger.error(f"未找到目标窗口: {target_window_title}")
            self.send_response({
                "action": "init_response",
                "status": "error",
                "message": f"未找到目标窗口: {target_window_title}",
                "pid": os.getpid(),
                "timestamp": time.time()
            })
            return
            
        self.logger.info(f"成功找到目标窗口: {window_info['title']}")
        self.logger.debug(f"窗口完整信息: {window_info}")
            
        # Filter window_info to only include required fields
        filtered_window_info = {
            'title': window_info['title'],
            'box': window_info['box'],
            'position': window_info['position'],
            'size': {
                'width': window_info['size'].width,
                'height': window_info['size'].height
            },
            'target_window_title': target_window_title
        }
        
        # 保存窗口信息到controller中
        self.logger.debug(f"保存过滤后的窗口信息: {filtered_window_info}")
        self.controller.window_info = filtered_window_info
        self.controller.initialized = True
        self.logger.info("初始化完成，controller状态已更新")
        
        response = {
            "action": "init_response",
            "status": "success",
            "pid": os.getpid(),
            "window_info": filtered_window_info,
            "timestamp": time.time()
        }
        self.logger.debug(f"发送初始化成功响应: {response}")
        self.send_response(response) 
