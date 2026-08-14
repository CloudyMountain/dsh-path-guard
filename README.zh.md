# dsh-path-guard

> 给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh) 补上它从未有过的**路径级拒绝规则**：拒绝代理访问**你指定**的目录——**读写一起拦**，文件工具和 shell 命令都覆盖。等价于 Claude Code 的 `permissions.deny` / PreToolUse hook。

[English](README.md)

## 为什么需要它

dsh 内建的权限只有三样：sandbox 模式（`read-only` / `workspace-write` / `danger-full-access`）+ 审批策略——**没有路径级 deny**。workspace 内任何文件都可读，沙箱栅栏只管写。如果你的交易数据、密钥、私人文档和工作文件放在一起，你没法告诉代理"这个目录永远不许碰"。这个插件就是干这个的。

## 特性

- ✅ **读写都拦**——沙箱拦不住读，这个守卫在工具执行闸门上拦；
- ✅ **目录由你指定**：插件行里的 `guardRoots` 数组，支持多个路径，中文等任意路径都行；
- ✅ **两个面都覆盖**：文件工具（`read`/`write`/`edit`/`grep`/`glob`/`str_replace_editor`/`read_image`…）按 `file_path`/`path`/`directory` 参数精确匹配（按会话 cwd 解析）；shell 命令（`bash`/`terminal`…）按文本扫描（规范路径、`~/`、`$HOME` 拼写）；
- ✅ **单调且全局**：后续 `tools/pre-execute` 监听器无法翻案；对子代理和 `run_code` 子调度同样生效；
- ✅ **失败必响**：没配置 `guardRoots` → 插件惰性 + 加载时打印警告。不会让人在虚假安全感里裸奔；
- ✅ **零依赖**，纯 `ctx.tools.guard()`，任何位置直接加载。

## 安装

```bash
# 1. 拿插件
git clone https://github.com/CloudyMountain/dsh-path-guard
cd dsh-path-guard

# 2. 带上你的保护路径安装
./install.sh /home/you/vault                  # 单个路径
./install.sh /home/you/vault /home/you/keys   # 多个路径
./install.sh                                  # 交互式输入

# 3. 重启 dsh web（systemd 用户服务示例）
systemctl --user restart dsh-web

# 4. 新会话 → 这些路径对代理永久关闭
```

手动安装：`ln -s "$PWD" ~/.dsh/profiles/node_modules/path-guard`，然后在 `~/.dsh/profiles/web/cordis.patch.yml`（及 headless）追加：

```yaml
- insert:
    - id: path-guard
      name: path-guard
      config:
        guardRoots:
          - /home/you/vault
          - /home/you/.secrets
```

## 拦截长什么样

代理的工具调用在执行前直接失败：

```
path-guard: access to "/home/you/vault/x.csv" is denied — the protected root /home/you/vault is off-limits to the agent (reads and writes)
```

## 威胁模型——请务必读

**这是可信代码里的策略守卫，不是内核边界。** 它挡得住：误操作、模型"照指令办事"的越权、常规的越界访问。它**挡不住**存心对抗的模型：

- shell 文本扫描是启发式的：`cd`+相对路径、命令替换、变量间接、编码、符号链接路径都能穿过（`test.js` 的 BYPASS 行逐一记录）；
- 文件参数检查是词法精确的——指向受保护目录的符号链接不在覆盖内；
- 拦截发生在进程内（检查与系统调用之间的 TOCTOU 竞态被收窄但未消除）。

要内核级隔离：给 dsh 单开系统用户 / 容器化 / 目录只读挂载。这个守卫负责 99% 的场景：**代理不会"不小心"走进来。**

## 配置

| 键 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `guardRoots` | `string[]` | `[]`（惰性+警告） | 要保护的绝对路径；相对路径按插件 cwd 解析，请用绝对路径 |

## 开发

```bash
node test.js   # 决策表 + 已记录绕过 + 无配置行为
```

## 卸载

```bash
rm ~/.dsh/profiles/node_modules/path-guard
# 删除两个 cordis.patch.yml 里的 path-guard insert 块
```

## License

MIT
