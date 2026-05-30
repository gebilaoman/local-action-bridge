from abc import ABC, abstractmethod

class BaseAction(ABC):
    def __init__(self, controller):
        self.controller = controller
        self.logger = controller.logger

    @abstractmethod
    def execute(self, message):
        """执行具体的action逻辑"""
        pass

    def send_response(self, response):
        """发送响应消息"""
        self.controller.send_message(response) 