# Shadowsocks-Rust

OpenWrt 透明代理解决方案，基于 shadowsocks-rust，提供 LuCI 图形界面配置。

## 功能特性

- 基于 shadowsocks-rust 的高性能透明代理
- 支持 TCP/UDP 透明代理 (tproxy)
- 可增删的本地监听（redir / dns / socks / http）
- 智能 DNS 分流（代理域名走隧道，其余可直连或自定义解析）
- ACL 规则支持（域名、IP、源地址分流）
- LuCI 图形界面配置
- 多服务器负载均衡
- 重放攻击防护

## 安装

### 方式一：IPK 安装包（推荐）

1. 在 OpenWrt 管理界面：`系统` → `软件包` → `上传安装`
2. 或通过命令行安装：

```bash
scp shadowsocks-rust_*.ipk root@router:/tmp/
ssh root@router "opkg install /tmp/shadowsocks-rust_*.ipk /tmp/luci-app-shadowsocks-rust_*.ipk"
```

### 方式二：手动安装

```bash
# 1. 安装 sslocal 与运行依赖
ssh root@router "opkg update && opkg install shadowsocks-rust-sslocal resolveip nftables kmod-nft-tproxy ucode ucode-mod-fs ucode-mod-uci"

# 2. 复制 LuCI 界面文件
scp -r luci-app-shadowsocks-rust/htdocs/* root@router:/www/
scp -r luci-app-shadowsocks-rust/root/* root@router:/

# 3. 复制后端配置和脚本文件
scp -r shadowsocks-rust/files/* root@router:/

# 4. 启用服务
ssh root@router "/etc/init.d/shadowsocks-rust enable"
```

也可用仓库里的 `deploy.sh` 一键部署（默认保留远端 UCI；加 `-r` 用仓库默认配置覆盖）。

### 方式三：编译 ipk（OpenWrt 源码 / SDK）

仓库按 LuCI 插件的标准结构组织，目录与包的对应关系：

| 目录 | 软件包 | 说明 |
|------|--------|------|
| `luci-app-shadowsocks-rust/` | `luci-app-shadowsocks-rust` | LuCI 界面（`luci.mk`） |
| `shadowsocks-rust/` | `shadowsocks-rust` | TProxy 服务（UCI、ucode 防火墙模板）；同时编译 sslocal 等子包 |
| `simple-obfs/` | `simple-obfs`、`simple-obfs-server` | SIP003 混淆；服务包当前依赖客户端 `simple-obfs` |

把这些目录放入 feed 或 `package/` 下，然后：

```bash
make package/shadowsocks-rust/compile V=s
make package/luci-app-shadowsocks-rust/compile V=s
make package/simple-obfs/compile V=s
```

### 依赖

安装包时会自动拉取主要依赖；手动安装时请确保：

```bash
opkg update
opkg install nftables kmod-nft-tproxy ucode ucode-mod-fs ucode-mod-uci resolveip
```

`resolveip` 用于启动时把节点域名钉成 IP，避免透明代理回环。域名解析失败时会短暂重试；如果启动时 WAN 还没拨号完成，`wan` / `wan6` 接口 up 后会自动重载服务再解析一次。

## 配置使用

LuCI 页面：`服务` → `Shadowsocks-Rust`

| 页面 | 内容 |
|------|------|
| Basic Settings | 总开关、Local Service（本地监听）、Advanced Settings |
| Nodes | Shadowsocks 节点 |
| Rules | 分流策略、TProxy 选用的 redir、域名 DNS |
| Log | sslocal / 插件相关系统日志 |

### Basic Settings

1. **Enabled**：允许启动服务（关闭时不启 sslocal、不装规则）
2. **Local Service**：可增删的本地监听，默认两条：
   - `redir`：透明代理，端口 `60080`
   - `dns`：DNS 中继，端口 `5300`，上游如 `1.1.1.1`（经隧道查询）
3. 需要时再添加 `socks` / `http` 等监听
4. **Advanced Settings**：运行模式、TCP 选项、日志级别等

> 至少要有一个启用的 local 和一个启用的 node，服务才会启动。

### 节点配置（Nodes）

1. 添加 Shadowsocks 节点
2. 填写：
   - **Server**：IPv4、IPv6 或域名（域名启动时用 `resolveip` 解析；DNS 未就绪会重试，仍失败则跳过该节点，WAN 接口 up 后自动重载服务）
   - **端口 / 密码 / 加密方式**：推荐 `aes-256-gcm` 或 `chacha20-ietf-poly1305`
   - **Plugin**：目前仅支持 `obfs-local`（simple-obfs）

> 远程节点在 UCI 里是 `config node`。建议同时配置 IPv4 和 IPv6；sslocal 会在节点间做负载均衡。

> 加密方式下拉只列出当前 sslocal 支持的算法。不受支持的方式会导致 sslocal 拒绝启动。

#### 使用 obfs 混淆（simple-obfs）

1. 安装 `/usr/bin/obfs-local`（服务包已依赖 `simple-obfs`）
2. 服务端运行对应的 `obfs-server`
3. 节点 Plugin 选 `obfs-local`，Plugin Options 例如：`obfs=http;obfs-host=www.bing.com`

> simple-obfs 只处理 TCP；该节点的 UDP（含 UDP DNS）往往无法经插件转发。

### 高级设置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| runtime_mode | `multi_thread`：按 CPU 核数开 Tokio worker（不写 worker_count）；`single_thread`：单线程更省内存 | multi_thread |
| client_cache_size | 每个上游保留的空闲 DNS 连接数 | 64 |
| no_delay | TCP_NODELAY | 启用 |
| keep_alive | TCP 保活间隔（秒） | 15 |
| nofile | 最大文件描述符 | 10240 |
| fast_open | TCP Fast Open | 禁用 |
| mptcp | 多路径 TCP | 禁用 |
| log_level | `info` / `debug` / `trace` | info |

分流相关（域名、IP、源地址）在 Rules 页面配置。

### 应用配置与日志

配置完成后点「保存并应用」。日志在 `Log` 页，或：

```bash
logread -e sslocal
logread -e shadowsocks-rust
```

## 配置文件说明

| 文件 | 说明 |
|------|------|
| `/etc/config/shadowsocks-rust` | UCI 配置（LuCI 读写） |
| `/var/shadowsocks-rust/config.json` | 运行时生成的 sslocal 配置（tmpfs） |
| `/var/shadowsocks-rust/shadowsocks-rust.nft` | 运行时渲染的 nftables 规则 |
| `/usr/share/shadowsocks-rust/ss-rules/` | nftables / dnsmasq 模板（ucode） |

UCI 主要段：

- `config conf main`：总开关
- `config settings global`：高级选项
- `config local '…'`：本地监听（redir / dns / socks / http）
- `config rules 'settings'`：分流与 `tproxy_local`
- `config node`：远程节点

## 服务管理

```bash
/etc/init.d/shadowsocks-rust start
/etc/init.d/shadowsocks-rust stop
/etc/init.d/shadowsocks-rust restart
/etc/init.d/shadowsocks-rust status
/etc/init.d/shadowsocks-rust enable
/etc/init.d/shadowsocks-rust disable
```

## 性能调优

### 容易踩空的地方

**1. 收发缓冲区不要写进 config.json**

`inbound_*_buffer_size` / `outbound_*_buffer_size` 不会从配置文件生效，只会静默忽略。优先调大内核 `rmem`/`wmem` 上限，让自动调整工作。

**2. `timeout` 是连接超时，不是空闲超时**

默认 `15` 合适；调太大只会拖慢故障节点切换。空闲回收靠 `keep_alive` / `udp_timeout`。

**3. 不要手写 `worker_count`**

上游说明：未配置时等于 CPU 核数。本插件在 `multi_thread` 下故意不写 `worker_count`。小内存设备可改 `runtime_mode=single_thread`：

```bash
uci set shadowsocks-rust.global.runtime_mode=single_thread
uci commit shadowsocks-rust && /etc/init.d/shadowsocks-rust restart
```

### 客户端推荐

```bash
uci set shadowsocks-rust.global.runtime_mode=multi_thread
uci set shadowsocks-rust.global.no_delay=1
uci commit shadowsocks-rust && /etc/init.d/shadowsocks-rust restart
```

`fast_open` 建议保持关闭——不少中间设备会丢带 TFO 的 SYN。

### 系统参数

代理节点和路由器都建议：

```bash
net.ipv4.tcp_congestion_control = bbr
net.core.default_qdisc = fq            # 路由器用 fq_codel
net.ipv4.tcp_slow_start_after_idle = 0
net.core.rmem_max = 67108864
net.core.wmem_max = 67108864
net.ipv4.tcp_rmem = 4096 87380 67108864
net.ipv4.tcp_wmem = 4096 65536 67108864
net.ipv4.tcp_mtu_probing = 1
```

OpenWrt 加载 BBR：

```bash
modprobe tcp_bbr
echo tcp_bbr > /etc/modules.d/99-tcp-bbr
```

路由器用 `fq_codel` 减轻 bufferbloat；`default_qdisc` 只对新建 qdisc 生效，已有接口需手动替换：

```bash
for dev in pppoe-wan eth0 eth1; do tc qdisc replace dev $dev root fq_codel; done
```

## 常见问题

### 安装后 LuCI 界面不显示

```bash
rm -rf /tmp/luci-*
# 浏览器强制刷新 / 禁用缓存
```

### 无法上网（DNS / 节点问题）

1. `/etc/init.d/shadowsocks-rust stop` 临时关掉
2. 检查 Nodes、Local Service（dns/redir）和 Rules 里的 DNS / TProxy Local
3. 再启动服务

### OpenWrt 版本要求

- 需要 `ucode`（约 22.03+）
- 日志页需要较新的 LuCI（`tools.views`，约 23.05+）

```bash
opkg update
opkg install nftables kmod-nft-tproxy ucode ucode-mod-fs ucode-mod-uci resolveip
```

### IPv6

建议同时配置 IPv6 节点；仅有 AAAA 记录的域名在没有 IPv6 出口/节点时可能打不开。

### DNS 与分流

```
[客户端] → [dnsmasq]
              ├─ bypass / 其它域名 → Bypass / Other Domains DNS（或系统 DNS）
              └─ 代理域名 → Proxy Domain DNS（可选本机 dns local，经隧道）
                              └─ 解析 IP 写入 nft set → 命中则 tproxy
```

在 `Rules` → `Policy`：

- **TProxy Local**：选择一个已启用的 redir，nftables 把代理流量投到该端口
- **Proxy / Bypass / Other Domains DNS**：可留空（系统 DNS）、选已启用的 dns local（`127.0.0.1:端口`），或手填 `ip:port`
- **Apply TProxy Rules**：关闭时只跑 sslocal 监听，不改路由 / nft / dnsmasq
- **Hijack LAN DNS**：把局域网 53 端口劫持到本机 dnsmasq，使客户端跟域名规则走

其它：

- **Source Bypass / Forward / Check Destination**：按客户端源 IP
- **Proxy / Bypass Domain、IP Set**：按目的域名或 IP；同名冲突时 bypass 优先
- 远程域名/IP 列表 URL 与刷新间隔也在 Rules 里配置

## 许可证

GNU General Public License v3.0
