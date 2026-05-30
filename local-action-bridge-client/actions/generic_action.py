import time
import traceback

import pyautogui

from .base_action import BaseAction


class GenericAction(BaseAction):
    SUPPORTED_STEP_TYPES = {
        "move",
        "click",
        "hotkey",
        "press",
        "write",
        "wait"
    }

    def execute(self, message):
        action_key = message.get("action_key") or message.get("name") or "anonymous"
        steps = message.get("steps")

        if not isinstance(steps, list) or not steps:
            return self._send_error_response(action_key, "steps must be a non-empty list")

        try:
            self.logger.info("Executing generic action: %s", action_key)
            for index, step in enumerate(steps):
                self._execute_step(step, index)

            self.send_response({
                "action": "execute_actions_response",
                "status": "success",
                "action_key": action_key,
                "message": f"{action_key} executed",
                "timestamp": time.time()
            })
        except Exception as e:
            error_trace = traceback.format_exc()
            self.logger.error(
                "Error executing generic action %s: %s\nStacktrace:\n%s",
                action_key,
                str(e),
                error_trace
            )
            return self._send_error_response(action_key, str(e))

    def _execute_step(self, step, index):
        if not isinstance(step, dict):
            raise ValueError(f"Step {index} must be an object")

        step_type = step.get("type")
        if step_type not in self.SUPPORTED_STEP_TYPES:
            raise ValueError(f"Unsupported step type at index {index}: {step_type}")

        if step_type == "move":
            x, y = self._resolve_coordinates(step)
            pyautogui.moveTo(x=x, y=y, duration=step.get("duration", 0))
            return

        if step_type == "click":
            x = step.get("x")
            y = step.get("y")
            if x is not None or y is not None:
                x, y = self._resolve_coordinates(step)
                pyautogui.click(
                    x=x,
                    y=y,
                    clicks=step.get("clicks", 1),
                    interval=step.get("interval", 0),
                    button=step.get("button", "left")
                )
            else:
                pyautogui.click(
                    clicks=step.get("clicks", 1),
                    interval=step.get("interval", 0),
                    button=step.get("button", "left")
                )
            return

        if step_type == "hotkey":
            keys = step.get("keys")
            if not isinstance(keys, list) or not keys:
                raise ValueError(f"Step {index} hotkey keys must be a non-empty list")
            pyautogui.hotkey(*keys)
            return

        if step_type == "press":
            key = step.get("key")
            if not key:
                raise ValueError(f"Step {index} press key is required")
            pyautogui.press(key, presses=step.get("presses", 1), interval=step.get("interval", 0))
            return

        if step_type == "write":
            text = step.get("text")
            if text is None:
                raise ValueError(f"Step {index} write text is required")
            pyautogui.write(str(text), interval=step.get("interval", 0))
            return

        if step_type == "wait":
            duration_ms = step.get("duration_ms", step.get("ms", 0))
            time.sleep(max(0, duration_ms) / 1000)

    def _resolve_coordinates(self, step):
        x = step.get("x")
        y = step.get("y")
        if x is None or y is None:
            raise ValueError("x and y are required for coordinate-based steps")

        coordinate_mode = step.get("coordinate_mode", step.get("mode", "screen"))
        if coordinate_mode == "screen":
            return x, y

        if coordinate_mode == "window":
            window_info = self.controller.window_info
            if not window_info:
                raise ValueError("Window info not found")

            position = window_info.get("position")
            if not position:
                box = window_info.get("box")
                if not box:
                    raise ValueError("Window position not found")
                position = (box[0], box[1])

            return position[0] + x, position[1] + y

        raise ValueError(f"Unsupported coordinate_mode: {coordinate_mode}")

    def _send_error_response(self, action_key, error_message):
        self.send_response({
            "action": "execute_actions_response",
            "status": "error",
            "action_key": action_key,
            "message": error_message,
            "timestamp": time.time()
        })
