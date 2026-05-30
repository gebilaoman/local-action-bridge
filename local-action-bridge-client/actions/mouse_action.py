from .base_action import BaseAction
import pyautogui
import time


class MouseAction(BaseAction):
    def move(self, x, y, duration=0):
        pyautogui.moveTo(x=x, y=y, duration=duration)

    def click(self):
        pyautogui.click()
        time.sleep(0.1)  # 短暂延迟确保点击完成 


class MouseMoveAction(MouseAction):
    def execute(self, message):
        try:

            window_info = self.controller.window_info
            if not window_info:
                self.logger.error("Window info not found")
                return self._send_error_response("Window not found")

            position = window_info.get('position')
            size = window_info.get('size')
            width = size.get('width')
            height = size.get('height')
            if width > 0 and height > 0:
                x, y = position
                center_x = x + width / 2 - 180
                center_y = y + height / 2 + 180
                pyautogui.moveTo(center_x, center_y)
                pyautogui.click()
                self.logger.info(f"Window activated at X:{center_x} Y:{center_y}")

            # x = message.get('x')
            # y = message.get('y')
            # duration = message.get('duration', 0)

            # if x is None or y is None:
            #     return self._send_error_response("Missing x or y coordinates")
            #
            # self.move(x, y, duration)

            self.send_response({
                "action": "mouse_move_response",
                "status": "success",
                "x": x,
                "y": y,
                "timestamp": time.time()
            })

        except Exception as e:
            return self._send_error_response(str(e))

    def _send_error_response(self, error_message):
        self.send_response({
            "action": "mouse_move_response",
            "status": "error",
            "message": error_message,
            "timestamp": time.time()
        })


class MouseClickAction(MouseAction):
    def execute(self, message):
        try:
            self.click()
            self.send_response({
                "action": "mouse_click_response",
                "status": "success",
                "timestamp": time.time()
            })

        except Exception as e:
            return self._send_error_response(str(e))

    def _send_error_response(self, error_message):
        self.send_response({
            "action": "mouse_click_response",
            "status": "error",
            "message": error_message,
            "timestamp": time.time()
        })
