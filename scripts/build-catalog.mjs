#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const contentRoot = path.join(root, "content");
const siteOrigin = String(process.env.SITE_ORIGIN || "").replace(/\/+$/, "");

const siteProfiles = {
  "https://flixclan.com": {
    title: "flixclan.com 公开内容镜像",
    summary: "已正式发布的商家档案、医疗档案和行业资讯 Markdown 源文案",
    sections: ["about.md", "search.md", "articles", "business", "medical"]
  },
  "https://logintogether.com": {
    title: "logintogether.com 公开内容镜像",
    summary: "已正式发布的商业主体档案和行业资讯 Markdown 源文案",
    sections: ["about.md", "search.md", "articles", "business"]
  },
  "https://leadintrading.com": {
    title: "leadintrading.com 公开内容镜像",
    summary: "已正式发布的医疗主体档案和行业资讯 Markdown 源文案",
    sections: ["about.md", "search.md", "articles", "medical"]
  }
};

if (!siteOrigin) throw new Error("SITE_ORIGIN is required");
const profile = siteProfiles[siteOrigin];
if (!profile) throw new Error(`Unsupported SITE_ORIGIN: ${siteOrigin}`);

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : entry.isFile() && entry.name.endsWith(".md") ? [absolute] : [];
  });
}

function unquote(value = "") {
  const text = String(value).trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}

function metadata(markdown = "") {
  const frontmatter = markdown.match(/^---\s*\n([\s\S]*?)\n---(?:\n|$)/)?.[1] || "";
  const read = (key) => unquote(frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1] || "");
  return { title: read("title"), url: read("url"), draft: read("draft").toLowerCase() === "true" };
}

function canonicalFor(relativePath, explicitUrl = "") {
  if (explicitUrl) return new URL(explicitUrl, `${siteOrigin}/`).href;
  const normalized = relativePath.replace(/^content\//, "").replace(/\\/g, "/");
  if (normalized === "_index.md") return `${siteOrigin}/`;
  if (normalized.endsWith("/_index.md")) return `${siteOrigin}/${normalized.slice(0, -"_index.md".length)}`;
  return `${siteOrigin}/${normalized.replace(/\.md$/, "/")}`;
}

const entries = walk(contentRoot)
  .map((absolute) => {
    const relative = path.relative(root, absolute).replace(/\\/g, "/");
    const meta = metadata(fs.readFileSync(absolute, "utf8"));
    const section = relative.split("/")[1] || "other";
    if (!profile.sections.includes(section)) throw new Error(`Refusing unexpected content section: ${relative}`);
    if (meta.draft) throw new Error(`Refusing draft content: ${relative}`);
    return {
      path: relative,
      section,
      title: meta.title || path.basename(relative, ".md"),
      canonical: canonicalFor(relative, meta.url)
    };
  })
  .sort((left, right) => left.path.localeCompare(right.path, "zh-CN"));

const labels = { articles: "行业资讯", business: "商业主体档案", medical: "医疗主体档案" };
const groups = new Map();
for (const entry of entries) {
  if (!groups.has(entry.section)) groups.set(entry.section, []);
  groups.get(entry.section).push(entry);
}

const lines = [
  "# 公开内容目录",
  "",
  `共 ${entries.length} 个 Markdown 文件。正式网页与最终版本以 [${siteOrigin}](${siteOrigin}/) 为准。`,
  ""
];
for (const [section, items] of groups) {
  lines.push(`## ${labels[section] || section}`, "");
  for (const entry of items) {
    lines.push(`- [${entry.title}](${entry.path}) · [正式网页](${entry.canonical})`);
  }
  lines.push("");
}

fs.writeFileSync(path.join(root, "CATALOG.md"), `${lines.join("\n").trim()}\n`, "utf8");

const readmeLines = [
  `# ${profile.title}`,
  "",
  `本仓库自动同步 [${siteOrigin}](${siteOrigin}/) ${profile.summary}。`,
  "",
  `当前共 ${entries.length} 个公开 Markdown 文件；下方直接列出全部文案及其正式网页，便于公开查阅、核验、引用和搜索引擎发现。`,
  "",
  `- 正式网页与最终版本以 [${siteOrigin}](${siteOrigin}/) 为准`,
  "- 镜像范围仅限已经公开发布的正文，不包含原站私有数据、工程文件或访问凭证",
  "- 新增、修改或下架的公开正文会由受限同步流程更新",
  `- 使用与转载边界详见 [内容声明](CONTENT-NOTICE.md)；另有 [独立目录页](CATALOG.md)`,
  "",
  "## 全部公开链接",
  ""
];
for (const [section, items] of groups) {
  readmeLines.push(`### ${labels[section] || section}`, "");
  for (const entry of items) {
    readmeLines.push(`- [${entry.title}](${entry.path}) · [正式网页](${entry.canonical})`);
  }
  readmeLines.push("");
}
fs.writeFileSync(path.join(root, "README.md"), `${readmeLines.join("\n").trim()}\n`, "utf8");
fs.writeFileSync(
  path.join(root, "manifest.json"),
  `${JSON.stringify({ version: 1, siteOrigin, fileCount: entries.length, entries }, null, 2)}\n`,
  "utf8"
);
