---
date: 2026-10-23
description: Debian/Ubuntu 与 Rocky/RHEL 下开启 SSH root 远程登录：设置 root 密码、修改 sshd 配置、放行防火墙、验证与排错，并给出更安全的仅密钥方案。
---
# Linux 开启远程 root 登录（SSH）

让 root 能通过 SSH 登录，本质上要同时满足三件事：

1. root 账号有可用的登录凭据（密码或公钥）
2. sshd 配置允许 root 登录（`PermitRootLogin`）
3. 网络链路放行（sshd 正在监听 + 防火墙 + 云安全组）

少任何一条，表现都是“连不上”或“密码对却登不进去”。这篇按顺序把三步走完，再给出排错表和更安全的替代方案。

::: warning 先把风险说清楚
root + 密码暴露在公网 22 端口，基本会在几分钟内开始被爆破。本文的 `PermitRootLogin yes` 只建议在**内网、实验环境或临时维护**时使用；长期方案请直接跳到「仅密钥登录」，或者干脆保留 `prohibit-password`、日常用普通用户 + `sudo`。
:::

## 先选一种策略

| 策略 | `PermitRootLogin` | `PasswordAuthentication` | 说明 |
|---|---|---|---|
| 仅密钥（推荐） | `prohibit-password` | `no` | root 只能用公钥登录，最安全 |
| 密码 + 密钥 | `yes` | `yes` | 本文主要场景，调试方便 |
| 完全禁止 | `no` | 无所谓 | 默认最安全，用普通用户 `sudo` |
| 仅强制命令 | `forced-commands-only` | `no` | 只允许带 `command=` 的公钥，运维特殊场景 |

> `prohibit-password` 的旧写法是 `without-password`；OpenSSH 7.0 之后默认值就是 `prohibit-password`。

## 0. 准备：确认 sshd 和服务名

不同发行版的服务名、日志位置不一样，先对号入座：

| 发行版 | 服务名 | 配置文件 | 日志 |
|---|---|---|---|
| Debian / Ubuntu | `ssh` | `/etc/ssh/sshd_config` | `journalctl -u ssh`、`/var/log/auth.log` |
| Rocky / RHEL / Alma | `sshd` | `/etc/ssh/sshd_config` | `journalctl -u sshd`、`/var/log/secure` |

确认 sshd 是否安装并在运行：

```bash
# Debian / Ubuntu
sudo apt update
sudo apt install -y openssh-server
sudo systemctl status ssh

# Rocky / RHEL / Alma
sudo dnf install -y openssh-server
sudo systemctl status sshd
```

再确认端口在监听：

```bash
sudo ss -tlnp | grep sshd
```

开始之前记住一条铁律：**保留一个已经登录的 SSH 会话或云控制台 VNC 窗口，别把当前连接关掉**。配置改错时，它就是你的退路。

## 1. 给 root 设置密码

云镜像（Ubuntu、Debian 尤其明显）通常把 root 锁定了，只给普通用户 sudo。先看状态：

```bash
sudo passwd -S root
```

输出以 `P` 开头表示已设密码，`L` 表示锁定。设置或重置密码：

```bash
sudo passwd root
```

设置完再检查一次，正常应显示 `P`：

```bash
sudo passwd -S root
```

如果仍是 `L`（少见），手动解锁：

```bash
sudo passwd -u root
```

顺便确认 root 的 shell 和账号有效期，避免“密码对了但登录被拒”：

```bash
getent passwd root          # 最后一列应是 /bin/bash 或 /bin/sh，不能是 /sbin/nologin
sudo chage -l root          # Account expires 应为 never
```

如果 shell 是 `nologin`：

```bash
sudo usermod -s /bin/bash root
```

> 已设置密码但只有密钥、没有密码登录需求时，这一步可以跳过。

## 2. 找到真正生效的配置

现代发行版（Ubuntu 22.04+、Debian 12、RHEL/Rocky 9）的 `sshd_config` 顶部都有一行：

```text
Include /etc/ssh/sshd_config.d/*.conf
```

sshd 的规则是：**同一个关键字，以第一次出现的值为准**。由于 `Include` 在主文件顶部，`sshd_config.d/` 里的配置会**优先于**主文件后面写的 `PermitRootLogin`。很多人改了主文件却不生效，就是被 drop-in 覆盖了。

先看当前实际生效的值，而不是只看文件里写了什么：

```bash
sudo sshd -T | grep -Ei '^(permitrootlogin|passwordauthentication|port|allowusers)'
```

再看 drop-in 目录里有什么：

```bash
grep -in '^Include' /etc/ssh/sshd_config
ls -l /etc/ssh/sshd_config.d/
```

如果 `Include` 不存在（老系统），就跳过下一步的 drop-in，直接编辑主文件。

## 3. 写入配置

推荐用 drop-in 文件，别直接改主文件（主文件可能被系统升级或 cloud-init 覆盖）：

```bash
sudo tee /etc/ssh/sshd_config.d/00-root-login.conf >/dev/null <<'EOF'
PermitRootLogin yes
PasswordAuthentication yes
EOF

sudo chmod 644 /etc/ssh/sshd_config.d/00-root-login.conf
```

两个细节：

- **`00-` 前缀**是为了排到 `50-cloud-init.conf` 前面。云镜像常在 `50-cloud-init.conf` 里写 `PasswordAuthentication no`，如果文件名排在它后面，你的配置会被忽略。
- 如果目录里已经有文件定义了同名关键字，且名字比你的更靠前，改那个文件，或把新文件改成更早的名字。

只想允许 root 用密钥登录，把第一行换成：

```text
PermitRootLogin prohibit-password
PasswordAuthentication no
```

没有 `Include` 的老系统，手动编辑 `/etc/ssh/sshd_config`：

```bash
sudo vi /etc/ssh/sshd_config
```

找到并修改（没有就新增）：

```text
PermitRootLogin yes
PasswordAuthentication yes
```

注意：如果文件里已经有一行未注释的 `PermitRootLogin no` 在前面，后面再加一行 `yes` 不生效，改原来那行。

## 4. 检查语法并生效

先做语法检查，再重启。顺序别反：

```bash
sudo sshd -t
```

没有输出就是通过。然后确认“生效值”确实变了：

```bash
sudo sshd -T | grep -Ei '^(permitrootlogin|passwordauthentication)'
```

重启服务：

```bash
# Debian / Ubuntu
sudo systemctl restart ssh

# Rocky / RHEL / Alma
sudo systemctl restart sshd
```

补充几点：

- 只改认证相关配置，`systemctl reload ssh` 通常也够；改端口、监听地址必须 `restart`。
- 如果 `sshd -t` 报错，**不要重启**，先按报错行号修配置。
- 有些云镜像会在重启后被 cloud-init 重新写回配置。重启机器后建议再跑一次 `sshd -T` 确认。

## 5. 放行网络

sshd 在监听，不等于外部能连。按顺序查三层：

**① 本机监听**

```bash
sudo ss -tlnp | grep sshd
```

**② 主机防火墙**

```bash
# ufw（Ubuntu 常见）
sudo ufw status
sudo ufw allow 22/tcp

# firewalld（Rocky / RHEL 常见）
sudo firewall-cmd --list-all
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --reload
```

**③ 云安全组 / 轻量应用服务器防火墙**

腾讯云、阿里云、AWS 等都要在控制台放行入站 22（或你自定义的端口）。这一层最容易被忘：`ping` 通但 SSH 一直 `Connection timed out`，八成是安全组或防火墙。

> 改过 SSH 端口才需要额外处理 SELinux；22 端口不需要。详见第 8 节。

## 6. 验证

**不要关掉当前会话**，另开一个终端测试：

```bash
ssh -o PreferredAuthentications=password -o PubkeyAuthentication=no root@服务器IP
```

- 指定 `PreferredAuthentications=password` 是为了确认“密码登录这条路”真的通了，而不是悄悄走了公钥或 keyboard-interactive。
- 如果服务端走的是 PAM 的 keyboard-interactive，改成：

```bash
ssh -o PreferredAuthentications=keyboard-interactive root@服务器IP
```

看到 `root@hostname:~#` 就成功了。此时再关掉旧会话。

## 7. 连不上？按现象排错

| 现象 | 常见原因 | 处理 |
|---|---|---|
| `Connection timed out` | 云安全组 / 防火墙拦截、IP 不通 | 查安全组、`ufw`/`firewalld`、路由 |
| `Connection refused` | sshd 没启动、端口不对、只监听了 127.0.0.1 | `systemctl status ssh(d)`、`ss -tlnp`、`Port`/`ListenAddress` |
| `Permission denied (publickey,password)` | root 被锁、密码未设、`PasswordAuthentication no`、`PermitRootLogin no` | `passwd -S root`、`sshd -T` 逐项核对 |
| 密码明明正确仍拒绝 | 账号过期、shell 为 nologin、`AllowUsers`/`DenyUsers` 排除了 root、PAM 拒绝 | `chage -l root`、`getent passwd root`、`sshd -T` |
| 改完配置没生效 | drop-in 优先级被覆盖、改错文件、没重启 | `sshd -T` 看生效值；确认 `Include` 顺序 |
| 改端口后连不上 | 防火墙没放行新端口、SELinux 未授权、安全组没放行 | 见下方 SELinux 命令 |
| `Too many authentication failures` | 客户端挨个试本机私钥，次数超限 | `ssh -o IdentitiesOnly=yes -i ~/.ssh/你的key root@IP` |
| 突然被拒，之前正常 | fail2ban 封禁、云厂商风控 | `sudo fail2ban-client status sshd`、查安全组/云监控 |

看服务端日志最快：

```bash
# Debian / Ubuntu
sudo journalctl -u ssh -n 50 --no-pager
sudo tail -n 50 /var/log/auth.log

# Rocky / RHEL
sudo journalctl -u sshd -n 50 --no-pager
sudo tail -n 50 /var/log/secure
```

客户端加 `-vvv` 可以看到卡在哪个认证阶段：

```bash
ssh -vvv root@服务器IP
```

改过端口时，SELinux（Rocky/RHEL 默认 enforcing）需要给新端口打标签：

```bash
sudo semanage port -l | grep ssh
sudo semanage port -a -t ssh_port_t -p tcp 2222
# 端口已存在时用 -m 修改：
# sudo semanage port -m -t ssh_port_t -p tcp 2222
```

## 8. 更安全的做法

### 8.1 仅密钥登录（推荐）

客户端生成密钥（已有可跳过）：

```bash
ssh-keygen -t ed25519 -C "root@server"
```

把公钥装到服务器（此时需要密码登录是通的）：

```bash
ssh-copy-id -i ~/.ssh/id_ed25519.pub root@服务器IP
```

也可以手动放：

```bash
sudo mkdir -p /root/.ssh
sudo chmod 700 /root/.ssh
sudo vi /root/.ssh/authorized_keys      # 粘贴客户端 ~/.ssh/id_ed25519.pub 的内容
sudo chown -R root:root /root/.ssh
sudo chmod 600 /root/.ssh/authorized_keys
```

然后把配置改成仅密钥：

```text
PermitRootLogin prohibit-password
PasswordAuthentication no
```

检查并重启，**先确认密钥能登录，再关密码**：

```bash
sudo sshd -t && sudo systemctl restart ssh
```

### 8.2 其他加固

- **限制来源 IP**：安全组只放行自己的出口 IP；或在 sshd 里写 `AllowUsers root@203.0.113.10`（注意配了 `AllowUsers` 后，其他用户也会被一并限制）。
- **fail2ban**：自动封禁多次失败的来源 IP，Ubuntu/Debian 用 `apt install fail2ban`，Rocky 需要 EPEL。
- **换端口**：只能减少扫描噪音，不是安全措施；换完记得同步防火墙、安全组、SELinux。
- **用完就关**：临时排障才开 root，事情办完把 `PermitRootLogin` 改回 `prohibit-password` 或 `no`。
- **看登录记录**：

```bash
sudo lastb | head        # 失败登录
sudo last -a | head      # 成功登录
```

## 9. 回滚

配置出问题时，保留会话，删掉 drop-in 再重启即可：

```bash
sudo rm -f /etc/ssh/sshd_config.d/00-root-login.conf
sudo sshd -t
sudo systemctl restart ssh     # 或 sshd
```

如果是直接改的主文件，把 `PermitRootLogin`、`PasswordAuthentication` 改回原值，再执行同样的检查与重启。

## 最小操作清单

```bash
# 1. 设密码
sudo passwd root
# 2. 写配置（Debian/Ubuntu 用 ssh，Rocky/RHEL 用 sshd）
sudo tee /etc/ssh/sshd_config.d/00-root-login.conf >/dev/null <<'EOF'
PermitRootLogin yes
PasswordAuthentication yes
EOF
# 3. 校验 + 重启
sudo sshd -t && sudo systemctl restart ssh
# 4. 确认生效值
sudo sshd -T | grep -Ei '^(permitrootlogin|passwordauthentication)'
# 5. 放行防火墙/安全组后，另开会话测试
ssh -o PreferredAuthentications=password root@服务器IP
```
