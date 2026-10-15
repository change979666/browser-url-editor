#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
@description: 浏览器自动化消息助手监控程序
@author: Claude
@date: 2024-03-21
"""

import sys
import os
import json
import time
import logging
from datetime import datetime
from PyQt5.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, 
                            QHBoxLayout, QLabel, QTextEdit, QPushButton, 
                            QFileDialog, QMessageBox, QTabWidget, QLineEdit, 
                            QSpinBox, QGroupBox, QFormLayout, QInputDialog, 
                            QListWidget)
from PyQt5.QtCore import Qt, pyqtSignal, QThread, QMetaObject, Q_ARG
import threading
import webbrowser
import subprocess
import pyperclip
import pyautogui
import pygetwindow as gw
import win32gui
import win32con
import win32process
import psutil
import ctypes

def is_admin():
    """检查是否具有管理员权限"""
    try:
        return ctypes.windll.shell32.IsUserAnAdmin()
    except:
        return False

def run_as_admin():
    """以管理员权限重新运行程序"""
    if not is_admin():
        # 获取当前脚本的完整路径
        script = os.path.abspath(sys.argv[0])
        # 使用ShellExecute以管理员权限运行
        ctypes.windll.shell32.ShellExecuteW(None, "runas", sys.executable, script, None, 1)
        sys.exit()

# 在程序开始时检查管理员权限
run_as_admin()

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("monitor.log", encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("Monitor")

class ConfigManager:
    """配置管理类"""
    
    def __init__(self):
        """初始化配置管理器"""
        self.message_content = ""  # 消息内容
        self.base_url = ""  # 基础URL，包含{id}占位符
        self.url_cursor_position = 0  # URL输入框的光标位置
        self.config_lock = threading.Lock()
        self.logger = logging.getLogger('ConfigManager')
        
        # 加载上次保存的配置
        self.load_config()
        
    def load_config(self):
        """加载上次保存的配置"""
        try:
            if os.path.exists('config.json'):
                with open('config.json', 'r', encoding='utf-8') as f:
                    config = json.load(f)
                    self.message_content = config.get('messageContent', '')
                    self.base_url = config.get('baseUrl', '')
                    self.url_cursor_position = config.get('urlCursorPosition', 0)
        except Exception as e:
            self.logger.error(f"加载配置失败: {e}")
            
    def save_config(self):
        """保存当前配置"""
        try:
            config = {
                'messageContent': self.message_content,
                'baseUrl': self.base_url,
                'urlCursorPosition': self.url_cursor_position
            }
            with open('config.json', 'w', encoding='utf-8') as f:
                json.dump(config, f, ensure_ascii=False, indent=4)
        except Exception as e:
            self.logger.error(f"保存配置失败: {e}")
            
    def get_config(self):
        """获取当前配置"""
        with self.config_lock:
            return {
                'messageContent': self.message_content,
                'baseUrl': self.base_url,
                'urlCursorPosition': self.url_cursor_position
            }
            
    def update_config(self, config):
        """更新配置"""
        with self.config_lock:
            if 'messageContent' in config:
                self.message_content = config['messageContent']
            if 'baseUrl' in config:
                self.base_url = config['baseUrl']
            if 'urlCursorPosition' in config:
                self.url_cursor_position = config['urlCursorPosition']
                
            # 保存配置
            self.save_config()
                
    def validate_config(self):
        """验证配置是否有效"""
        if not self.message_content:
            return False, "消息内容不能为空"
        if not self.base_url:
            return False, "基础URL不能为空"
        if "{id}" not in self.base_url:
            return False, "基础URL必须包含{id}占位符"
        return True, "配置有效"

class IDManager:
    """ID管理器"""
    
    def __init__(self, config_manager):
        self.ids = []
        self.config_manager = config_manager
        self.logger = logging.getLogger('IDManager')
        self.current_index = 0
    
    def load_from_file(self, filename):
        """从文件加载ID"""
        try:
            with open(filename, 'r', encoding='utf-8') as f:
                self.ids = [line.strip() for line in f if line.strip()]
            logger.info(f"从文件加载了 {len(self.ids)} 个ID")
            return True
        except Exception as e:
            logger.error(f"加载ID文件失败: {e}")
            return False
    
    def add_id(self, id_str):
        """添加单个ID"""
        if id_str and id_str not in self.ids:
            self.ids.append(id_str)
            logger.info(f"添加ID: {id_str}")
            return True
        return False
    
    def get_next_id(self):
        """获取下一个ID"""
        if not self.ids:
            return None
        id_str = self.ids[self.current_index]
        self.current_index = (self.current_index + 1) % len(self.ids)
        return id_str
    
    def clear(self):
        """清空ID列表"""
        self.ids.clear()
        self.current_index = 0
        logger.info("ID列表已清空")

    def get_all_ids(self):
        """获取所有ID"""
        return self.ids

class MonitorThread(QThread):
    """监控线程"""
    
    log_signal = pyqtSignal(str)
    status_signal = pyqtSignal(str)
    url_signal = pyqtSignal(str)
    message_signal = pyqtSignal(str)  # 添加消息信号
    
    def __init__(self, config_manager, id_manager):
        super().__init__()
        self.config_manager = config_manager
        self.id_manager = id_manager
        self.running = False
        self.current_url = ""
        
    def run(self):
        """运行监控线程"""
        self.running = True
        self.log_signal.emit("开始自动操作...")
        
        try:
            # 获取基础URL
            base_url = self.config_manager.base_url
            if not base_url:
                self.log_signal.emit("错误: 未设置基础URL")
                self.running = False
                return
                
            # 检查URL中是否包含{id}占位符
            if "{id}" not in base_url:
                self.log_signal.emit("错误: URL模板中未包含{id}占位符")
                self.running = False
                return
                
            # 获取所有ID
            ids = self.id_manager.get_all_ids()
            if not ids:
                self.log_signal.emit("错误: ID列表为空")
                self.running = False
                return
                
            self.log_signal.emit(f"共找到 {len(ids)} 个ID")
            
            # 处理每个ID
            for i, id_str in enumerate(ids):
                if not self.running:
                    break
                    
                try:
                    # 替换URL中的{id}占位符
                    url = base_url.replace("{id}", id_str)
                    self.current_url = url
                    
                    # 发送URL信号
                    self.url_signal.emit(url)
                    
                    # 等待页面加载
                    time.sleep(2)
                    
                    # 获取消息内容
                    message = self.config_manager.message_content
                    if message:
                        # 复制消息到剪贴板
                        pyperclip.copy(message)
                        
                        # 模拟按键操作
                        pyautogui.hotkey('ctrl', 'v')  # 粘贴
                        
                        # 等待5秒
                        self.log_signal.emit("等待5秒后发送消息...")
                        time.sleep(5)
                        
                        # 按回车键发送消息
                        pyautogui.press('enter')
                        
                        self.log_signal.emit(f"已发送消息: {message}")
                    else:
                        self.log_signal.emit("警告: 消息内容为空，跳过发送操作")
                    
                    # 更新状态
                    self.status_signal.emit(f"正在处理: {id_str} ({i+1}/{len(ids)})")
                    self.log_signal.emit(f"正在处理URL: {url}")
                    
                    # 等待5秒
                    time.sleep(5)
                    
                except Exception as e:
                    self.log_signal.emit(f"处理ID {id_str} 时出错: {e}")
                    continue  # 继续处理下一个ID
                    
        except Exception as e:
            self.log_signal.emit(f"自动操作异常: {e}")
            
        finally:
            self.running = False
            self.status_signal.emit("自动操作已停止")
            
    def stop(self):
        """停止监控线程"""
        self.running = False
        self.wait()

    def open_url_in_browser(self, url):
        """在战斧浏览器中打开URL并自动填入消息"""
        try:
            # 首先检查战斧浏览器是否已经运行
            browser_window = detect_zhanfu_browser()
            if browser_window:
                # 如果战斧浏览器已经运行，直接使用它
                hwnd = browser_window["hwnd"]
                
                # 确保窗口未最小化
                if win32gui.IsIconic(hwnd):
                    win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
                
                # 将窗口置于前台
                win32gui.SetForegroundWindow(hwnd)
                
                # 使用Ctrl+T快捷键打开新标签页
                pyautogui.hotkey('ctrl', 't')
                time.sleep(1)  # 等待新标签页创建
                
                # 在新标签页中打开URL
                pyperclip.copy(url)
                pyautogui.hotkey('ctrl', 'v')
                pyautogui.press('enter')
                
                self.log_signal.emit(f"已在战斧浏览器中打开URL: {url}")
            else:
                # 如果没有找到战斧浏览器，尝试启动它
                browser_path = 'D:\\Program Files (x86)\\zhanfubrowser\\4.2.0.8\\Core\\zhanfubrowser.exe'
                if os.path.exists(browser_path):
                    # 启动战斧浏览器
                    subprocess.Popen([browser_path, url])
                    self.log_signal.emit(f"已启动战斧浏览器并打开URL: {url}")
                    
                    # 等待浏览器启动
                    time.sleep(5)
                    
                    # 再次检查战斧浏览器窗口
                    browser_window = detect_zhanfu_browser()
                    if not browser_window:
                        raise Exception("战斧浏览器启动失败")
                else:
                    raise Exception("未找到战斧浏览器可执行文件")
            
            # 等待页面加载 - 增加到10秒
            self.log_signal.emit("等待页面加载...")
            time.sleep(10)
            
            # 获取消息内容
            message = self.config_manager.message_content
            if message:
                # 复制消息到剪贴板
                pyperclip.copy(message)
                
                # 确保窗口在前台
                if browser_window:
                    win32gui.SetForegroundWindow(browser_window["hwnd"])
                    
                    # 使用Tab键定位到输入框
                    self.log_signal.emit("使用Tab键定位输入框...")
                    for _ in range(12):  # 增加到12次Tab键
                        pyautogui.press('tab')
                        time.sleep(1)  # 每次按Tab键后等待1秒
                    
                    # 等待一下确保焦点在输入框
                    time.sleep(2)
                    
                    # 粘贴内容
                    self.log_signal.emit("粘贴消息内容...")
                    pyautogui.hotkey('ctrl', 'v')
                    time.sleep(2)  # 等待粘贴完成
                    
                    # 等待5秒
                    self.log_signal.emit("等待5秒后发送消息...")
                    time.sleep(5)
                    
                    # 按回车键发送消息
                    pyautogui.press('enter')
                    
                    self.log_signal.emit(f"已发送消息: {message}")
            else:
                self.log_signal.emit("警告: 消息内容为空，跳过发送操作")
                
        except Exception as e:
            self.log_signal.emit(f"使用战斧浏览器打开URL失败: {e}")
            QMessageBox.critical(self, "错误", f"使用战斧浏览器打开URL失败: {e}")
            # 恢复按钮状态
            self.auto_start_button.setEnabled(True)
            self.auto_stop_button.setEnabled(False)

    def send_message(self):
        """发送消息"""
        try:
            message = self.message_input.toPlainText().strip()
            if not message:
                QMessageBox.warning(self, "警告", "请输入要发送的消息")
                return
                
            # 获取当前URL
            url = self.base_url.text().strip()
            if not url:
                QMessageBox.warning(self, "警告", "请先设置URL")
                return
                
            # 在浏览器中打开URL
            self.open_url_in_browser(url)
            
            # 等待页面加载
            time.sleep(2)
            
            # 复制消息到剪贴板
            pyperclip.copy(message)
            
            # 模拟按键操作
            pyautogui.hotkey('ctrl', 'v')  # 粘贴
            
            # 等待5秒
            self.log_signal.emit("等待5秒后发送消息...")
            time.sleep(5)
            
            # 按回车键发送消息
            pyautogui.press('enter')
            
            self.log_signal.emit(f"已发送消息: {message}")
            
        except Exception as e:
            self.log_signal.emit(f"发送消息失败: {e}")
            QMessageBox.critical(self, "错误", f"发送消息失败: {e}")

def get_all_windows():
    """获取所有窗口的三维特征"""
    windows = []
    
    # 使用枚举窗口回调函数
    def callback(hwnd, ctx):
        if win32gui.IsWindowVisible(hwnd):
            # 获取三维特征指纹
            _, pid = win32process.GetWindowThreadProcessId(hwnd)
            try:
                proc = psutil.Process(pid)
                window_info = {
                    "hwnd": hwnd,
                    "title": win32gui.GetWindowText(hwnd),
                    "class": win32gui.GetClassName(hwnd),
                    "exe_path": proc.exe(),
                    "process_name": proc.name(),
                    "cmdline": " ".join(proc.cmdline())
                }
                windows.append(window_info)
            except psutil.NoSuchProcess:
                pass
        return True
    
    win32gui.EnumWindows(callback, None)
    return windows

def detect_zhanfu_browser():
    """检测战斧浏览器窗口"""
    for win in get_all_windows():
        # 精确匹配战斧浏览器窗口
        if (win.get("hwnd") == 330358 and
            win.get("title") == "TK-TwoNi" and
            win.get("class") == "Chrome_WidgetWin_1" and
            win.get("exe_path") == "D:\\Program Files (x86)\\zhanfubrowser\\4.2.0.8\\Core\\zhanfubrowser.exe" and
            win.get("process_name") == "zhanfubrowser.exe"):
            return win
    return None

def validate_browser_status():
    """综合验证浏览器状态"""
    # 阶段2：窗口级验证
    active_windows = detect_browser_windows()
    if not active_windows:
        return False
    
    # 扩展验证（可添加自动化操作）
    try:
        # 示例：窗口置顶/截图验证等
        active_windows[0].activate()
        return True
    except Exception as e:
        print(f"浏览器窗口操作异常：{str(e)}")
        return False

def find_tab_control(hwnd):
    """递归查找符合Chromium特性的Tab条区域"""
    try:
        # 获取窗口类名
        class_name = win32gui.GetClassName(hwnd)
        
        # 检查是否是标签栏控件
        if "Chrome_TabStrip" in class_name or "TabWindowClass" in class_name:
            return hwnd
            
        # 检查是否是地址栏控件
        if "Chrome_OmniboxView" in class_name:
            return hwnd
            
        # 检查是否是浏览器窗口
        if "Chrome_WidgetWin_1" in class_name:
            return hwnd
            
        # 递归检查子窗口
        child = win32gui.GetWindow(hwnd, win32con.GW_CHILD)
        while child:
            result = find_tab_control(child)
            if result:
                return result
            child = win32gui.GetWindow(child, win32con.GW_HWNDNEXT)
            
        return None
        
    except Exception as e:
        print(f"查找标签栏控件时出错: {e}")
        return None

def send_newtab_command(hwnd):
    """通过窗口消息发送Ctrl+T组合键"""
    WM_KEYDOWN = 0x100
    WM_KEYUP = 0x101
    
    # 发送Ctrl键按下
    ctypes.windll.user32.SendMessageW(hwnd, WM_KEYDOWN, win32con.VK_CONTROL, 0)
    # 发送T键按下
    ctypes.windll.user32.SendMessageW(hwnd, WM_KEYDOWN, ord('T'), 0)
    # 释放T键
    ctypes.windll.user32.SendMessageW(hwnd, WM_KEYUP, ord('T'), 0)
    # 释放Ctrl键
    ctypes.windll.user32.SendMessageW(hwnd, WM_KEYUP, win32con.VK_CONTROL, 0)
    return True

class MainWindow(QMainWindow):
    """主窗口类"""
    
    # 添加信号定义
    log_signal = pyqtSignal(str)
    
    def __init__(self):
        """初始化主窗口"""
        super().__init__()
        self.config_manager = ConfigManager()
        self.id_manager = IDManager(self.config_manager)
        self.monitor_thread = None
        self.setup_ui()
        self.setup_logging()
        
        # 连接log_signal到append_log方法
        self.log_signal.connect(self.append_log)
        
        # 加载上次保存的消息内容
        if self.config_manager.message_content:
            self.message_input.setPlainText(self.config_manager.message_content)
        
        # 加载上次保存的基础URL和光标位置
        if self.config_manager.base_url:
            self.base_url.setText(self.config_manager.base_url)
            self.base_url.setCursorPosition(self.config_manager.url_cursor_position)
        
        # 连接消息内容改变信号
        self.message_input.textChanged.connect(self.save_message_content)
        self.base_url.textChanged.connect(self.save_base_url)
        self.base_url.cursorPositionChanged.connect(self.save_url_cursor_position)
        
    def open_url_in_browser(self, url):
        """在战斧浏览器中打开URL并自动填入消息"""
        try:
            # 首先检查战斧浏览器是否已经运行
            browser_window = detect_zhanfu_browser()
            if browser_window:
                # 如果战斧浏览器已经运行，直接使用它
                hwnd = browser_window["hwnd"]
                
                # 确保窗口未最小化
                if win32gui.IsIconic(hwnd):
                    win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
                
                # 将窗口置于前台
                win32gui.SetForegroundWindow(hwnd)
                
                # 使用Ctrl+T快捷键打开新标签页
                pyautogui.hotkey('ctrl', 't')
                time.sleep(1)  # 等待新标签页创建
                
                # 在新标签页中打开URL
                pyperclip.copy(url)
                pyautogui.hotkey('ctrl', 'v')
                pyautogui.press('enter')
                
                self.log_signal.emit(f"已在战斧浏览器中打开URL: {url}")
            else:
                # 如果没有找到战斧浏览器，尝试启动它
                browser_path = 'D:\\Program Files (x86)\\zhanfubrowser\\4.2.0.8\\Core\\zhanfubrowser.exe'
                if os.path.exists(browser_path):
                    # 启动战斧浏览器
                    subprocess.Popen([browser_path, url])
                    self.log_signal.emit(f"已启动战斧浏览器并打开URL: {url}")
                    
                    # 等待浏览器启动
                    time.sleep(5)
                    
                    # 再次检查战斧浏览器窗口
                    browser_window = detect_zhanfu_browser()
                    if not browser_window:
                        raise Exception("战斧浏览器启动失败")
                else:
                    raise Exception("未找到战斧浏览器可执行文件")
            
            # 等待页面加载 - 增加到10秒
            self.log_signal.emit("等待页面加载...")
            time.sleep(10)
            
            # 获取消息内容
            message = self.config_manager.message_content
            if message:
                # 复制消息到剪贴板
                pyperclip.copy(message)
                
                # 确保窗口在前台
                if browser_window:
                    win32gui.SetForegroundWindow(browser_window["hwnd"])
                    
                    # 使用Tab键定位到输入框
                    self.log_signal.emit("使用Tab键定位输入框...")
                    for _ in range(12):  # 增加到12次Tab键
                        pyautogui.press('tab')
                        time.sleep(1)  # 每次按Tab键后等待1秒
                    
                    # 等待一下确保焦点在输入框
                    time.sleep(2)
                    
                    # 粘贴内容
                    self.log_signal.emit("粘贴消息内容...")
                    pyautogui.hotkey('ctrl', 'v')
                    time.sleep(2)  # 等待粘贴完成
                    
                    # 等待5秒
                    self.log_signal.emit("等待5秒后发送消息...")
                    time.sleep(5)
                    
                    # 按回车键发送消息
                    pyautogui.press('enter')
                    
                    self.log_signal.emit(f"已发送消息: {message}")
            else:
                self.log_signal.emit("警告: 消息内容为空，跳过发送操作")
                
        except Exception as e:
            self.log_signal.emit(f"使用战斧浏览器打开URL失败: {e}")
            QMessageBox.critical(self, "错误", f"使用战斧浏览器打开URL失败: {e}")
            # 恢复按钮状态
            self.auto_start_button.setEnabled(True)
            self.auto_stop_button.setEnabled(False)

    def setup_ui(self):
        """设置用户界面"""
        self.setWindowTitle('浏览器自动化消息助手')
        self.setGeometry(100, 100, 800, 600)
        
        # 创建中心部件和布局
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        layout = QVBoxLayout(central_widget)
        
        # 创建选项卡
        tabs = QTabWidget()
        layout.addWidget(tabs)
        
        # 配置选项卡
        config_tab = QWidget()
        config_layout = QVBoxLayout(config_tab)
        
        # 消息设置
        message_group = QGroupBox('消息设置')
        message_layout = QVBoxLayout(message_group)
        
        # 添加消息输入框
        self.message_input = QTextEdit()
        self.message_input.setPlaceholderText('输入要发送的消息')
        self.message_input.setMaximumHeight(100)
        message_layout.addWidget(QLabel('消息内容:'))
        message_layout.addWidget(self.message_input)
        
        config_layout.addWidget(message_group)
        
        # ID管理设置
        id_group = QGroupBox('ID管理')
        id_layout = QVBoxLayout(id_group)
        
        # ID列表显示
        self.id_list = QListWidget()
        id_layout.addWidget(QLabel('ID列表:'))
        id_layout.addWidget(self.id_list)
        
        # ID操作按钮
        id_button_layout = QHBoxLayout()
        
        self.import_id_button = QPushButton('导入ID')
        self.import_id_button.clicked.connect(self.import_ids)
        id_button_layout.addWidget(self.import_id_button)
        
        self.add_id_button = QPushButton('添加ID')
        self.add_id_button.clicked.connect(self.add_id)
        id_button_layout.addWidget(self.add_id_button)
        
        self.clear_id_button = QPushButton('清空ID')
        self.clear_id_button.clicked.connect(self.clear_ids)
        id_button_layout.addWidget(self.clear_id_button)
        
        id_layout.addLayout(id_button_layout)
        
        config_layout.addWidget(id_group)
        
        # 网址设置
        url_group = QGroupBox('网址设置')
        url_layout = QVBoxLayout(url_group)
        
        # 基础URL输入
        base_url_layout = QHBoxLayout()
        base_url_layout.addWidget(QLabel('基础URL:'))
        self.base_url = QLineEdit()
        self.base_url.setPlaceholderText('输入基础URL，例如: https://example.com/')
        base_url_layout.addWidget(self.base_url)
        
        # 添加插入函数值按钮
        self.insert_id_button = QPushButton('插入{id}')
        self.insert_id_button.clicked.connect(self.insert_id_placeholder)
        base_url_layout.addWidget(self.insert_id_button)
        
        url_layout.addLayout(base_url_layout)
        
        config_layout.addWidget(url_group)
        
        # 操作按钮
        button_layout = QHBoxLayout()
        
        self.auto_start_button = QPushButton('开始')
        self.auto_start_button.clicked.connect(self.start_auto_operation)
        button_layout.addWidget(self.auto_start_button)
        
        self.auto_stop_button = QPushButton('停止')
        self.auto_stop_button.clicked.connect(self.stop_monitoring)
        self.auto_stop_button.setEnabled(False)
        button_layout.addWidget(self.auto_stop_button)
        
        config_layout.addLayout(button_layout)
        
        # 状态显示
        status_group = QGroupBox('状态')
        status_layout = QVBoxLayout(status_group)
        
        # 添加状态标签
        self.status_label = QLabel('就绪')
        status_layout.addWidget(self.status_label)
        
        config_layout.addWidget(status_group)
        
        tabs.addTab(config_tab, '配置')
        
        # 日志选项卡
        log_tab = QWidget()
        log_tab_layout = QVBoxLayout(log_tab)
        
        self.log_text = QTextEdit()
        self.log_text.setReadOnly(True)
        log_tab_layout.addWidget(self.log_text)
        
        tabs.addTab(log_tab, '日志')
        
    def start_auto_operation(self):
        """开始自动操作"""
        try:
            if not self.id_manager.get_all_ids():
                QMessageBox.warning(self, "警告", "请先导入ID列表")
                return
            
            base_url = self.base_url.text().strip()
            if not base_url:
                QMessageBox.warning(self, "警告", "请输入URL模板")
                return
            
            if "{id}" not in base_url:
                QMessageBox.warning(self, "警告", "URL模板中必须包含{id}占位符")
                return
            
            # 获取消息内容
            message = self.message_input.toPlainText().strip()
            if not message:
                QMessageBox.warning(self, "警告", "请输入要发送的消息")
                return
            
            # 更新配置
            self.config_manager.base_url = base_url
            self.config_manager.message_content = message
            
            # 创建并启动监控线程
            self.monitor_thread = MonitorThread(self.config_manager, self.id_manager)
            self.monitor_thread.log_signal.connect(self.append_log)
            self.monitor_thread.status_signal.connect(self.update_status)
            self.monitor_thread.url_signal.connect(self.open_url_in_browser)
            self.monitor_thread.start()
            
            # 更新按钮状态
            self.auto_start_button.setEnabled(False)
            self.auto_stop_button.setEnabled(True)
            
        except Exception as e:
            self.log_signal.emit(f"启动自动操作失败: {e}")
            QMessageBox.critical(self, "错误", f"启动自动操作失败: {e}")
            # 恢复按钮状态
            self.auto_start_button.setEnabled(True)
            self.auto_stop_button.setEnabled(False)

    def import_ids(self):
        """导入ID列表"""
        try:
            filename, _ = QFileDialog.getOpenFileName(
                self,
                "选择ID文件",
                "",
                "文本文件 (*.txt);;所有文件 (*.*)"
            )
            
            if filename:
                with open(filename, 'r', encoding='utf-8') as f:
                    ids = [line.strip() for line in f if line.strip()]
                    
                if ids:
                    self.id_manager.clear()  # 清空现有ID
                    for id_str in ids:
                        self.id_manager.add_id(id_str)
                    self.update_id_list()
                    self.append_log(f"已导入 {len(ids)} 个ID")
                    QMessageBox.information(self, "成功", f"已导入 {len(ids)} 个ID")
                else:
                    QMessageBox.warning(self, "警告", "文件为空或格式不正确")
                    
        except Exception as e:
            logging.error(f"导入ID失败: {e}")
            QMessageBox.critical(self, "错误", f"导入ID失败: {e}")
            
    def update_id_list(self):
        """更新ID列表显示"""
        try:
            self.id_list.clear()
            ids = self.id_manager.get_all_ids()
            self.id_list.addItems(ids)
            
        except Exception as e:
            logging.error(f"更新ID列表失败: {e}")
            QMessageBox.critical(self, "错误", f"更新ID列表失败: {e}")
            
    def add_id(self):
        """添加单个ID"""
        try:
            id_str, ok = QInputDialog.getText(
                self,
                "添加ID",
                "请输入ID:",
                QLineEdit.Normal
            )
            
            if ok and id_str:
                if self.id_manager.add_id(id_str):
                    self.update_id_list()
                    self.append_log(f"已添加ID: {id_str}")
                else:
                    QMessageBox.warning(self, "警告", "ID已存在")
                    
        except Exception as e:
            logging.error(f"添加ID失败: {e}")
            QMessageBox.critical(self, "错误", f"添加ID失败: {e}")
            
    def clear_ids(self):
        """清空ID列表"""
        try:
            reply = QMessageBox.question(
                self,
                "确认",
                "确定要清空所有ID吗？",
                QMessageBox.Yes | QMessageBox.No,
                QMessageBox.No
            )
            
            if reply == QMessageBox.Yes:
                self.id_manager.clear()
                self.update_id_list()
                self.append_log("已清空ID列表")
                
        except Exception as e:
            logging.error(f"清空ID失败: {e}")
            QMessageBox.critical(self, "错误", f"清空ID失败: {e}")

    def setup_logging(self):
        """设置日志处理"""
        # 创建日志处理器
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
        
        # 获取根日志记录器
        logger = logging.getLogger()
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
        
        # 添加自定义日志处理器，将日志显示到界面
        class QTextEditLogger(logging.Handler):
            def __init__(self, text_widget):
                super().__init__()
                self.text_widget = text_widget
                
            def emit(self, record):
                msg = self.format(record)
                # 使用QMetaObject.invokeMethod确保在主线程中更新UI
                QMetaObject.invokeMethod(self.text_widget, "append",
                                        Qt.QueuedConnection,
                                        Q_ARG(str, msg))
                
        # 添加界面日志处理器
        ui_handler = QTextEditLogger(self.log_text)
        ui_handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
        logger.addHandler(ui_handler)

    def closeEvent(self, event):
        """关闭窗口事件"""
        try:
            # 停止监控线程
            if self.monitor_thread and self.monitor_thread.isRunning():
                self.monitor_thread.stop()
                self.monitor_thread.wait()
                
            # 接受关闭事件
            event.accept()
            
        except Exception as e:
            self.logger.error(f"关闭程序失败: {e}")
            # 强制关闭
            event.accept()
            
    def __del__(self):
        """析构函数"""
        try:
            # 确保所有资源都被释放
            if self.monitor_thread and self.monitor_thread.isRunning():
                self.monitor_thread.stop()
                self.monitor_thread.wait()
                
        except Exception as e:
            self.logger.error(f"清理资源失败: {e}")

    def stop_monitoring(self):
        """停止监控"""
        try:
            if not self.monitor_thread or not self.monitor_thread.isRunning():
                return
                
            # 停止监控线程
            self.monitor_thread.stop()
            self.monitor_thread.wait()
            
            # 更新按钮状态
            self.auto_start_button.setEnabled(True)
            self.auto_stop_button.setEnabled(False)
            
            # 更新状态显示
            self.status_label.setText("就绪")
            self.log_signal.emit("自动操作已停止")
            
        except Exception as e:
            self.log_signal.emit(f"停止监控失败: {e}")
            QMessageBox.critical(self, "错误", f"停止监控失败: {e}")
            
    def append_log(self, message):
        """添加日志"""
        self.log_text.append(message)
        
    def update_status(self, status):
        """更新状态"""
        self.status_label.setText(status)

    def insert_id_placeholder(self):
        """在光标位置插入{id}占位符"""
        cursor_pos = self.base_url.cursorPosition()
        current_text = self.base_url.text()
        new_text = current_text[:cursor_pos] + "{id}" + current_text[cursor_pos:]
        self.base_url.setText(new_text)
        # 将光标移动到插入的{id}后面
        self.base_url.setCursorPosition(cursor_pos + 3)

    def save_message_content(self):
        """保存消息内容"""
        message = self.message_input.toPlainText().strip()
        self.config_manager.message_content = message
        self.config_manager.save_config()
        
    def save_base_url(self):
        """保存基础URL"""
        url = self.base_url.text().strip()
        self.config_manager.base_url = url
        self.config_manager.save_config()

    def save_url_cursor_position(self):
        """保存URL输入框的光标位置"""
        self.config_manager.url_cursor_position = self.base_url.cursorPosition()
        self.config_manager.save_config()

if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = MainWindow()
    window.show()
    sys.exit(app.exec_()) 