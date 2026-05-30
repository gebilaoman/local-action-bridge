import os
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from actions.generic_action import GenericAction


class TestGenericAction(unittest.TestCase):
    def setUp(self):
        self.controller = MagicMock()
        self.controller.window_info = {
            "title": "Test App",
            "box": (100, 200, 900, 800),
            "position": (100, 200),
            "size": {
                "width": 800,
                "height": 600
            }
        }
        self.action = GenericAction(self.controller)

    @patch("actions.generic_action.time.sleep")
    @patch("actions.generic_action.pyautogui")
    def test_execute_mixed_steps(self, pyautogui_mock, sleep_mock):
        self.action.execute({
            "action": "execute_actions",
            "action_key": "sample",
            "steps": [
                {"type": "move", "coordinate_mode": "window", "x": 10, "y": 20},
                {"type": "click", "coordinate_mode": "screen", "x": 300, "y": 400},
                {"type": "hotkey", "keys": ["command", "a"]},
                {"type": "press", "key": "enter"},
                {"type": "write", "text": "hello"},
                {"type": "wait", "duration_ms": 50}
            ]
        })

        pyautogui_mock.moveTo.assert_called_once_with(x=110, y=220, duration=0)
        pyautogui_mock.click.assert_called_once_with(
            x=300,
            y=400,
            clicks=1,
            interval=0,
            button="left"
        )
        pyautogui_mock.hotkey.assert_called_once_with("command", "a")
        pyautogui_mock.press.assert_called_once_with("enter", presses=1, interval=0)
        pyautogui_mock.write.assert_called_once_with("hello", interval=0)
        sleep_mock.assert_called_once_with(0.05)

        sent_message = self.controller.send_message.call_args.args[0]
        self.assertEqual(sent_message["action"], "execute_actions_response")
        self.assertEqual(sent_message["status"], "success")
        self.assertEqual(sent_message["action_key"], "sample")

    @patch("actions.generic_action.pyautogui")
    def test_rejects_unknown_step_type(self, pyautogui_mock):
        self.action.execute({
            "action": "execute_actions",
            "action_key": "bad",
            "steps": [
                {"type": "unknown"}
            ]
        })

        pyautogui_mock.click.assert_not_called()
        sent_message = self.controller.send_message.call_args.args[0]
        self.assertEqual(sent_message["status"], "error")
        self.assertIn("Unsupported step type", sent_message["message"])


if __name__ == "__main__":
    unittest.main()
