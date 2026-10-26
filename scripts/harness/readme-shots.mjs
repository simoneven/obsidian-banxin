// 生成 README 用的截图：编辑器界面、模板前后对比
import { createRequire } from "module";
import path from "path";
import fs from "fs";
const require = createRequire(import.meta.url);
const { chromium } = require("/opt/npm-tools/node_modules/playwright");

const OUT = process.argv[2] ?? "docs";
fs.mkdirSync(OUT, { recursive: true });
const url = "file://" + path.resolve("scripts/harness/index.html");
const browser = await chromium.launch();

const NOTE = [
	"# 关于加强文档排版规范的通知",
	"## 总体要求",
	"为进一步提升文档质量，规范笔记与报告的排版，现就有关事项通知如下。中英文混排时，如 Obsidian 2026、PDF 导出等，应当清晰整齐。",
	"## 主要措施",
	"### 统一字体字号",
	"正文使用三号仿宋，层级标题依次使用黑体、楷体、仿宋加粗；行距为固定值 28 磅，每行约 28 字。",
	"### 规范标题层级",
	"标题编号按“一、（一）1.（1）”的顺序自动生成，不需要手工输入，调整顺序后编号自动更新。",
	"> 附：本通知自印发之日起施行。",
].join("\n");

async function notePage(applyTemplate) {
	const page = await browser.newPage({ viewport: { width: 760, height: 900 }, deviceScaleFactor: 2 });
	await page.goto(url);
	await page.evaluate(() => {
		document.getElementById("live").remove();
	});
	await page.evaluate(() => window.bootPlugin({ schemaVersion: 3, onboarded: true, firstChangeTipShown: true, sets: [{ id: "base01", name: "我的样式", elements: {}, options: {} }], activeSetId: "base01" }));
	if (applyTemplate) {
		// 按插件的正常流程套用模板（测试环境没有公文字体，会自动用替代字体）
		await page.evaluate(() => window.__plugin.openModal());
		await page.locator(".doc-style-head .doc-style-btn", { hasText: "模板" }).click();
		await page.locator(".doc-style-template-card", { hasText: "国标公文" }).click();
		await page.locator(".doc-style-template-dialog button", { hasText: "套用到当前样式集" }).click();
		await page.evaluate(() => document.querySelectorAll(".modal-container, .notice-container").forEach((e) => e.remove()));
	}
	await page.evaluate((md) => {
		const note = document.getElementById("note");
		note.style.padding = "36px 48px";
		note.insertAdjacentHTML("beforeend", window.renderMd(md));
		// 阅读视图的编号由后处理器根据原文生成；测试页没有 getSectionInfo，这里直接按原文编号
		const heads = [...note.querySelectorAll("h1,h2,h3")];
		const set = window.__plugin.setForPath("");
		if (set.options.numbering.style !== "none") {
			const lines = md.split("\n");
			const nums = window.__numbersFor(md, set);
			let hi = 0;
			lines.forEach((l, i) => {
				if (/^#{1,6}\s/.test(l)) {
					const h = heads[hi++];
					const t = nums.get(i);
					if (h && t) {
						const s = document.createElement("span");
						s.className = "doc-style-num";
						s.textContent = t;
						h.prepend(s);
					}
				}
			});
		}
	}, NOTE);
	await page.waitForTimeout(300);
	const el = await page.$("#note");
	const file = path.join(OUT, applyTemplate ? "after.png" : "before.png");
	await el.screenshot({ path: file });
	await page.close();
	return file;
}

const before = await notePage(false);
const after = await notePage(true);

// 编辑器截图
const page = await browser.newPage({ viewport: { width: 1300, height: 820 }, deviceScaleFactor: 2 });
await page.goto(url);
await page.evaluate(() => window.bootPlugin({ schemaVersion: 3, onboarded: true, firstChangeTipShown: true, sets: [{ id: "base01", name: "我的样式", elements: {}, options: {} }], activeSetId: "base01" }));
await page.evaluate(() => window.__plugin.openModal());
await page.locator(".doc-style-head .doc-style-btn", { hasText: "模板" }).click();
await page.locator(".doc-style-template-card", { hasText: "国标公文" }).click();
await page.locator(".doc-style-template-dialog button", { hasText: "套用到当前样式集" }).click();
await page.locator('.doc-style-tree-item[data-key="p"]').click();
await page.evaluate(() => document.querySelectorAll(".notice-container").forEach((e) => e.remove()));
await page.evaluate(() => { document.getElementById("note").remove(); document.getElementById("live").remove(); });
await page.waitForTimeout(400);
await (await page.$(".modal.doc-style-modal")).screenshot({ path: path.join(OUT, "editor.png") });

// 暗色 + 欢迎页
const p3 = await browser.newPage({ viewport: { width: 1300, height: 820 }, deviceScaleFactor: 2 });
await p3.goto(url);
await p3.evaluate(() => { document.body.classList.replace("theme-light", "theme-dark"); document.getElementById("note").remove(); document.getElementById("live").remove(); });
await p3.evaluate(() => window.bootPlugin(null));
await p3.evaluate(() => window.__plugin.openModal());
await p3.waitForTimeout(400);
await (await p3.$(".modal.doc-style-modal")).screenshot({ path: path.join(OUT, "welcome-dark.png") });

await browser.close();
console.log("done", before, after);
