import pywinctl as pwc

from util.dateUtil import get_current_time


def getAllTitles():
    return pwc.getAllTitles()
def get_window_info(title: str):
    # 检查并确保有适当的权限
    pwc.checkPermissions(True)
    # 打印所有窗口的标题
    # print(pwc.getAllTitles())

    # 使用标题获取所有匹配的窗口
    windows = pwc.getWindowsWithTitle(title, condition=pwc.Re.CONTAINS, flags=pwc.Re.IGNORECASE)

    # 如果找到了匹配的窗口，则返回第一个窗口的详细信息
    if windows:
        win = windows[0]
        is_raise_window = win.raiseWindow()  # 将窗口升高到顶部，以便它不会被任何同级窗口遮挡。
        if win.isActive:
            print(f"[{get_current_time()}]{title}窗口已经激活")
        else:
            if is_raise_window and win.activate():
                print(f"[{get_current_time()}]{title}窗口已重新激活")
        return {
            'title': win.title,
            'left': win.left,
            'right': win.right,
            'top': win.top,
            'bottom': win.bottom,
            'width': win.width,
            'height': win.height,
            'size': win.size,
            'box': (win.left, win.top, win.right, win.bottom),
            'position': win.position,
            'isActive': win.isActive
        }
    else:
        return None


if __name__ == '__main__':
    # print(pwc.getAllScreens())
    # print(pwc.getScreenSize())

    print(f"[{get_current_time()}]正在获取窗口信息...")
    print(pwc.getAllTitles())
    # 使用函数并打印结果
    title = 'TextEdit'
    window_info = get_window_info(title)
    if window_info:
        print([{get_current_time()}], title, window_info)
    else:
        print(f"[{get_current_time()}]未找到匹配的窗口。")
