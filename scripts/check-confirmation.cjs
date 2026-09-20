const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
let page
let toastOptions
vm.runInNewContext(fs.readFileSync(path.join(root, 'miniprogram/pages/confirmation/index.js'), 'utf8'), {
  Page: value => { page = value },
  Date,
  wx: {
    showToast: options => { toastOptions = options }
  }
})
page.setData = patch => Object.assign(page.data, patch)
page.onLoad({
  date: '2028-12-31',
  nights: '2',
  guests: '3',
  rooms: '2',
  name: encodeURIComponent('测试访客')
})
assert.equal(page.data.checkInYear, 2028)
assert.equal(page.data.checkOutYear, 2029)
assert.equal(page.data.checkInShort, '12月31日')
assert.equal(page.data.checkOutShort, '1月2日')
assert.equal(page.data.nights, 2)
assert.equal(page.data.guests, 3)
assert.equal(page.data.rooms, 2)
assert.equal(page.data.name, '测试访客')
assert.equal(page.data.voucherNo, '未生成编号')
page.setData({ saving: true })
page.finishSave('凭证已保存', 'success')
assert.equal(page.data.saving, false)
assert.equal(toastOptions.title, '凭证已保存')

const wxml = fs.readFileSync(path.join(root, 'miniprogram/pages/confirmation/index.wxml'), 'utf8')
for (const [, handler] of wxml.matchAll(/(?:bind\w+|catch\w+)="(\w+)"/g)) assert.equal(typeof page[handler], 'function', handler)
assert(wxml.includes('保存预览凭证'))
assert(wxml.includes('凭证预览'))
assert(wxml.includes('尚未提交'))
assert(!wxml.includes('预约申请已提交'))
assert(!wxml.includes('{{wechat}}'))
assert(!wxml.includes('返回修改预约信息'))
assert(wxml.includes('¥100 入住优惠'))
console.log('PASS: 预览参数、跨年日期、未提交语义、隐私展示、社群优惠、保存反馈与事件绑定')
