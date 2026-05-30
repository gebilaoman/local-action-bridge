from datetime import datetime

def get_current_time():
    """Returns the current time formatted as 'HH:MM:SS.mmm'."""
    return datetime.now().strftime('%H:%M:%S.%f')[:-3]
def get_current_time_ymdhms():
    """Returns the current time formatted as 'HH:MM:SS.mmm'."""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

if __name__ == '__main__':
    # 使用封装的函数打印结果
    response_json = "xxx"
    print(f'{get_current_time()} - GPT返回结果为: {response_json}')
