import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 本机自动验证时浏览器生成的临时文件
    ".shots/**",
    // 外部审阅材料与本机临时目录（含浏览器缓存，不属于本项目代码）
    "_review/**",
    ".dsh-drop/**",
    // 部署包目录：里面的 server.js 是刻意用 CommonJS 写的
    // （要在服务器上用 `node server.js` 直接跑，不经 Next 打包器），
    // 因此不适用 app 侧的模块规范。
    "deploy/**",
  ]),
]);

export default eslintConfig;
