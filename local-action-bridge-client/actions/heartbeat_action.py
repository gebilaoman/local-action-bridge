from .base_action import BaseAction
import time

class HeartbeatAction(BaseAction):
    def execute(self, message):
        self.controller.last_heartbeat = time.time()
        self.logger.info("Received heartbeat")
        self.send_response({
            "action": "heartbeat_response",
            "status": "success",
            "timestamp": self.controller.last_heartbeat
        }) 