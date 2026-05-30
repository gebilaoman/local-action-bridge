from .base_action import BaseAction

class ExitAction(BaseAction):
    def execute(self, message):
        self.logger.info("Received exit command, shutting down...")
        self.send_response({
            "action": "exit_response",
            "status": "success",
            "message": "Shutting down"
        })
        self.controller.running = False 