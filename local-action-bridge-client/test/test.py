import argparse
import json
import os
import struct
import subprocess
import sys
import time


class NativeMessagingTester:
    def __init__(self, script_path, target_window_title):
        self.process = subprocess.Popen(
            ['python3', script_path],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            bufsize=0,
            universal_newlines=False
        )
        self.target_window_title = target_window_title

    def send_message(self, message):
        encoded_message = json.dumps(message).encode('utf-8')
        self.process.stdin.write(struct.pack('I', len(encoded_message)))
        self.process.stdin.write(encoded_message)
        self.process.stdin.flush()
        print(f"已发送消息: {message}")

    def read_message(self):
        text_length_bytes = self.process.stdout.read(4)
        if not text_length_bytes:
            return None

        text_length = struct.unpack('I', text_length_bytes)[0]
        text = self.process.stdout.read(text_length)
        response = json.loads(text.decode('utf-8'))
        print(f"收到响应: {response}")
        return response

    def run_tests(self):
        try:
            self.send_message({
                "action": "init",
                "target_window_title": self.target_window_title
            })
            self.read_message()

            self.send_message({"action": "heartbeat"})
            self.read_message()

            self.send_message({
                "action": "execute_actions",
                "action_key": "click_center",
                "steps": [
                    {"type": "click", "coordinate_mode": "window", "x": 400, "y": 300}
                ]
            })
            self.read_message()

            self.send_message({"action": "exit"})
            time.sleep(0.5)
        finally:
            self.process.terminate()


def parse_args():
    parser = argparse.ArgumentParser(description='Native Messaging 测试工具')
    parser.add_argument('--script-path', default='../main.py', help='主程序脚本路径')
    parser.add_argument('--target-window-title', required=True, help='目标窗口标题关键字')
    return parser.parse_args()


def main():
    args = parse_args()
    current_dir = os.path.dirname(os.path.abspath(__file__))
    script_path = args.script_path
    if not os.path.isabs(script_path):
        script_path = os.path.join(current_dir, script_path)

    tester = NativeMessagingTester(script_path, args.target_window_title)
    tester.run_tests()


if __name__ == '__main__':
    main()
