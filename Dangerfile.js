// 変更点が短すぎる/テスト未記入/PR本文不足 等を自動指摘
const { danger, fail, warn, message } = require("danger");

const modified = danger.git.modified_files;
const added = danger.git.created_files;
const all = [...modified, ...added];

if (danger.github.pr.body.length < 50) {
  warn("PR本文が短いです。目的/変更点/確認方法をもう少し詳しく書いてください。");
}
if (all.some(f => f.startsWith("main.js")) && !all.some(f => f.startsWith("tests/"))) {
  warn("ゲーム本体を変更していますが `tests/` の追加・更新が見当たりません。ユニット/E2Eの更新を検討してください。");
}
