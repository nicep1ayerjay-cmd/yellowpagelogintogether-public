#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const contentRoot = path.join(root, "content");
const siteOrigin = String(process.env.SITE_ORIGIN || "").replace(/\/+$/, "");
const sourceCommit = String(process.env.SOURCE_COMMIT || "").trim();

if (!siteOrigin) throw new Error("SITE_ORIGIN is required");

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
  return { title: read("title"), url: read("url") };
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
fs.writeFileSync(
  path.join(root, "manifest.json"),
  `${JSON.stringify({ version: 1, siteOrigin, sourceCommit, fileCount: entries.length, entries }, null, 2)}\n`,
  "utf8"
);
