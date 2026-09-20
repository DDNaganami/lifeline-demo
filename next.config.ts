import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * 导出为纯静态网站（out/ 目录）。
   *
   * 为什么这样做：第一阶段原型没有数据库、没有后端 API、没有外部服务依赖，
   * 所有交互都在浏览器里完成（反馈存 localStorage）。因此可以直接导出成静态文件，
   * 部署时**不需要安装 Node 依赖、不需要 next 运行时**，一个静态文件服务器即可。
   */
  output: "export",
  /** 导出成 /dashboard/index.html 这种形式，静态服务器不需要额外 rewrite 规则 */
  trailingSlash: true,
};

export default nextConfig;
