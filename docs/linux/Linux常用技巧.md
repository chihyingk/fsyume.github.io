---
date: 2021-10-20
updated: 2026-10-23
---
# Linux常用技巧
## 启用远程root权限

三步：给 root 设密码（`sudo passwd root`）→ 让 sshd 允许 root（`PermitRootLogin yes`）→ 放行防火墙/安全组，然后 `systemctl restart ssh`（Rocky/RHEL 为 `sshd`）。

注意别只改 `/etc/ssh/sshd_config`：新系统顶部的 `Include` 会让 `/etc/ssh/sshd_config.d/*.conf` 优先于主文件。完整步骤、仅密钥方案和排错清单见：
[Linux 开启远程 root 登录（SSH）](/linux/Linux开启远程root登录)

## 查看系统信息
```shell
lscpu //查看CPU信息
lsblk //查看磁盘
free -h //查看内存
```

## screen 是 Linux 下的一个 终端多路复用工具
```shell
screen -S 名字	创建一个新的会话
screen -ls	查看当前有哪些会话
screen -r 名字	恢复（进入）指定会话
Ctrl + A + D	从当前会话分离，返回系统终端（程序继续运行）
exit	关闭当前会话（结束程序）
```

## Linux 查看端口占用情况

```shell
lsof -i:端口号
```

## 脱离终端的方式在后台运行shell命令

```shell
nohup 你的shell命令 &
```

## 常用任务管理命令

```shell
jobs //查看任务，返回任务编号n和进程号

bg %n //将编号为n的任务转后台运行

fg %n //将编号为n的任务转前台运行

ctrl+z //挂起当前任务

ctrl+c //结束当前任务
```