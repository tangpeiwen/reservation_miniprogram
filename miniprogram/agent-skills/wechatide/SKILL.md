---
name: wechatide
version: 1.0.0
description: 微信开发者工具的小程序项目验证能力
---

# 项目验证 Skill

这个 Skill 用于当前小程序项目的开发者工具 Agent 调用。

项目根目录由 `project.config.json` 的 `miniprogramRoot` 指定。验证应优先使用只读的编译、页面检查和运行时诊断能力；涉及真实点击、输入、提交或云数据写入时，必须先确认操作范围。

当前项目页面：

- `pages/reservation/index`
- `pages/confirmation/index`

预约提交使用 CloudBase 云函数 `submitReservation`，客户端不直接访问 `reservations` 集合。
