#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const contentRoot = path.join(root, "content");
const siteOrigin = String(process.env.SITE_ORIGIN || "").replace(/\/+$/, "");

const siteProfiles = {
  "https://flixclan.com": {
    title: "flixclan.com 综合行业信息站",
    description: "flixclan.com 面向企业、商家、医疗服务与消费决策场景，持续整理主体档案、服务信息、选择指南和行业文章，帮助读者按行业和具体需求查找公开资料。",
    sections: ["about.md", "search.md", "articles", "business", "medical"]
  },
  "https://logintogether.com": {
    title: "logintogether.com 商业服务信息站",
    description: "logintogether.com 聚焦企业服务、生活服务、教育培训、消费品牌与本地商业信息，持续更新商业主体档案、服务说明、行业观察和选择指南。",
    sections: ["about.md", "search.md", "articles", "business"]
  },
  "https://leadintrading.com": {
    title: "leadintrading.com 医疗健康信息站",
    description: "leadintrading.com 聚焦医疗健康、医生与医疗服务信息，持续更新医疗主体档案、就医与机构选择参考、常见服务说明和医疗行业相关文章。",
    sections: ["about.md", "search.md", "articles", "medical"]
  }
};

const relatedSites = [
  ["综合行业信息站 · flixclan.com", "https://flixclan.com/"],
  ["商业服务信息站 · logintogether.com", "https://logintogether.com/"],
  ["医疗健康信息站 · leadintrading.com", "https://leadintrading.com/"],
  ["图灵可信&优选 · 言中 AI", "https://www.yanzhongai.com/trusted-choice-certification.html#featured-content"],
  ["超级精选 · goodbusiness.cloud", "https://goodbusiness.cloud/"]
];

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
  return {
    title: read("title"),
    url: read("url"),
    biz: read("biz"),
    created: read("created"),
    updated: read("updated"),
    draft: read("draft").toLowerCase() === "true"
  };
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
      canonical: canonicalFor(relative, meta.url),
      customerKey: meta.biz,
      publishedAt: meta.updated || meta.created || ""
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

function newestFirst(left, right) {
  return right.publishedAt.localeCompare(left.publishedAt) || right.path.localeCompare(left.path, "zh-CN");
}

const customerProfiles = entries
  .filter((entry) => ["business", "medical"].includes(entry.section) && !entry.path.endsWith("/_index.md"))
  .sort((left, right) => left.title.localeCompare(right.title, "zh-CN"));
const articles = entries.filter((entry) => entry.section === "articles" && !entry.path.endsWith("/_index.md"));
const customerKeys = new Set(customerProfiles.map((entry) => entry.path.replace(/^content\//, "")));
const unresolvedArticles = articles.filter((entry) => entry.customerKey && !customerKeys.has(entry.customerKey));
if (unresolvedArticles.length) {
  throw new Error(`Refusing articles with unresolved customer profiles: ${unresolvedArticles.map((entry) => entry.path).join(", ")}`);
}
const generalArticles = articles.filter((entry) => !entry.customerKey).sort(newestFirst).slice(0, 20);

const readmeLines = [
  `# ${profile.title}`,
  "",
  profile.description,
  "",
  `当前收录 ${customerProfiles.length} 个主体档案和 ${articles.length} 篇关联文章。首页按客户分类，每位客户展示最新 20 篇；不足 20 篇时全部展示。完整内容见 [全部公开内容目录](CATALOG.md)。`,
  "",
  "## 相关网站",
  "",
  ...relatedSites.map(([label, url]) => `- [${label}](${url})`),
  "",
  "## 客户与最新文章",
  ""
];

for (const customer of customerProfiles) {
  const customerKey = customer.path.replace(/^content\//, "");
  const latest = articles.filter((entry) => entry.customerKey === customerKey).sort(newestFirst).slice(0, 20);
  readmeLines.push(`### [${customer.title}](${customer.path})`, "");
  readmeLines.push(`共 ${articles.filter((entry) => entry.customerKey === customerKey).length} 篇，显示最新 ${latest.length} 篇。`, "");
  for (const entry of latest) readmeLines.push(`- [${entry.title}](${entry.path})`);
  readmeLines.push("");
}

if (generalArticles.length) {
  readmeLines.push("## 行业公共内容", "");
  for (const entry of generalArticles) readmeLines.push(`- [${entry.title}](${entry.path})`);
  readmeLines.push("");
}

readmeLines.push(
  "## 公开项目说明",
  "",
  `本项目只整理已经在 [${siteOrigin}](${siteOrigin}/) 公开发布的页面正文。新增、修改或下架内容后，README 会由受限同步流程自动重新分类和更新。`,
  "",
  "本项目不包含原站私有数据库、服务器配置、部署凭证或未发布工程内容。使用与转载边界详见 [内容声明](CONTENT-NOTICE.md)。",
  ""
);
fs.writeFileSync(path.join(root, "README.md"), `${readmeLines.join("\n").trim()}\n`, "utf8");
fs.writeFileSync(
  path.join(root, "manifest.json"),
  `${JSON.stringify({
    version: 1,
    siteOrigin,
    fileCount: entries.length,
    entries: entries.map(({ customerKey, publishedAt, ...entry }) => entry)
  }, null, 2)}\n`,
  "utf8"
);
