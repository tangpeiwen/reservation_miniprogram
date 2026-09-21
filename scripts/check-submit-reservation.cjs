const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const root = path.resolve(__dirname, '..')
const source = fs.readFileSync(path.join(root, 'cloudfunctions/submitReservation/index.js'), 'utf8')
const savedRecords = []
let saveShouldFail = false
let page
let nowMs = Date.UTC(2028, 1, 26, 16)

class TestDate extends Date {
  constructor(...args) { super(...(args.length ? args : [nowMs])) }
  static now() { return nowMs }
}

const cloud = {
  DYNAMIC_CURRENT_ENV: Symbol('dynamic-current-env'),
  init: () => {},
  database: () => ({
    collection: name => {
      assert.equal(name, 'reservations')
      return {
        add: async ({ data }) => {
          if (saveShouldFail) throw new Error('database unavailable')
          savedRecords.push(data)
          return { _id: `reservation-${savedRecords.length}` }
        }
      }
    }
  })
}

const sandbox = {
  module: { exports: {} },
  exports: {},
  require: name => {
    if (name === 'wx-server-sdk') return cloud
    if (name === 'crypto') return { randomBytes: () => Buffer.from([0xab, 0xcd, 0x12, 0x34]) }
    throw new Error(`unexpected module: ${name}`)
  },
  Date: TestDate,
  console
}
sandbox.exports = sandbox.module.exports
vm.runInNewContext(`(function (exports, require, module) { ${source}\n})(exports, require, module)`, sandbox)
page = sandbox.module.exports

const valid = {
  checkInDate: '2028-02-28',
  nights: 2,
  guestCount: 3,
  roomCount: 2,
  name: '  测试访客  ',
  wechatId: '  test_wechat  ',
  notes: '  需要安静房间  '
}

async function main() {
  const result = await page.main(valid)
  assert.equal(result.ok, true)
  assert.equal(result.reservation.reservationNumber, 'AYV-280227-ABCD1234')
  assert.equal(result.reservation.checkOutDate, '2028-03-01')
  assert.equal(result.reservation.name, '测试访客')
  assert.equal(result.reservation.wechatId, 'test_wechat')
  assert.equal(result.reservation.notes, '需要安静房间')
  assert.equal(result.reservation.status, 'submitted')
  assert.equal(result.reservation.discountAmountCents, 10000)
  assert.equal(result.reservation.createdAt, '2028-02-26T16:00:00.000Z')
  assert.equal(savedRecords[0].reservationNumber, result.reservation.reservationNumber)
  assert.equal(savedRecords[0].checkOutDate, result.reservation.checkOutDate)
  assert.equal(savedRecords[0].createdAt.toISOString(), result.reservation.createdAt)

  const invalidCases = [
    { field: 'checkInDate', value: '2028-02-27' },
    { field: 'checkInDate', value: '2028-02-30' },
    { field: 'nights', value: 3 },
    { field: 'guestCount', value: 0 },
    { field: 'guestCount', value: 1.5 },
    { field: 'roomCount', value: 0 },
    { field: 'roomCount', value: 1, extra: { guestCount: 3 } },
    { field: 'name', value: '   ' },
    { field: 'wechatId', value: '' }
  ]
  for (const testCase of invalidCases) {
    const response = await page.main({ ...valid, ...testCase.extra, [testCase.field]: testCase.value })
    assert.equal(response.ok, false, testCase.field)
    assert.equal(response.error.code, 'INVALID_RESERVATION', testCase.field)
  }
  assert.equal(savedRecords.length, 1)

  saveShouldFail = true
  const failed = await page.main(valid)
  assert.equal(failed.ok, false)
  assert.equal(failed.error.code, 'SAVE_FAILED')
  assert.equal(savedRecords.length, 1)

  console.log('PASS: 服务端日期、晚数、人数、房间、容量、必填校验，离店日计算，唯一编号、创建时间与保存失败边界')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
