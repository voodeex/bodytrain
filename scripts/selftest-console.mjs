import { spawn } from 'node:child_process'
const [device, bundle] = process.argv.slice(2)
const child = spawn('xcrun', ['simctl', 'launch', '--terminate-running-process', '--console-pty', device, bundle], { stdio: ['ignore', 'pipe', 'pipe'] })
let buffer = '', done = false
const timer = setTimeout(() => { console.error('Самотест не завершился за 90 секунд'); process.exitCode = 1; child.kill() }, 90000)
const output = (data) => {
  buffer += data.toString()
  const lines = buffer.split(/\r?\n/)
  buffer = lines.pop() ?? ''
  for (const line of lines) {
    if (!line.includes('[SELFTEST]')) continue
    console.log(line)
    if (line.includes('[SELFTEST] done')) {
      done = true
      process.exitCode = line.includes('failures=0') ? 0 : 1
      clearTimeout(timer); child.kill()
    }
  }
}
child.stdout.on('data', output)
child.stderr.on('data', output)
child.on('error', (e) => { clearTimeout(timer); console.error(e.message); process.exitCode = 1 })
child.on('exit', () => { clearTimeout(timer); if (!done) { console.error('Приложение завершилось до конца самотеста'); process.exitCode = 1 } })
