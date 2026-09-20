import BirthForm from '@/components/birth-form';

const STEPS = [
  {
    title: '回看过去',
    desc: '左边是已经发生的年份。你逐条核对，符合就是符合，不符合就是不符合。',
  },
  {
    title: '定位现在',
    desc: '中间的竖线是你现在的位置。先知道自己站在哪，再谈下一步。',
  },
  {
    title: '规划未来',
    desc: '右边是还没发生的年份，写成可以提前准备的事，而不是一句吉凶。',
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 sm:px-8 sm:py-16">
      <header className="max-w-2xl">
        <p className="text-sm tracking-[0.2em] text-ink-3">LIFELINE</p>
        <h1 className="mt-3 text-3xl font-semibold leading-snug text-ink sm:text-4xl">
          人生战略曲线
        </h1>
        <p className="mt-4 text-base leading-relaxed text-ink-2">
          不是输入生日、吐出一份算命报告。
          <br />
          而是一条可以逐年回看、逐条核对、随时追问的人生时间轴。
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <a
            href="/ambient/"
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-ink-2 transition hover:border-line-strong"
          >
            桌面设备模拟器
          </a>
          <a
            href="/changelog/"
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-ink-2 transition hover:border-line-strong"
          >
            修改日志
          </a>
        </div>
      </header>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
        <section className="grid gap-4 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <div
              key={s.title}
              className="rounded-2xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(23,21,15,0.04)]"
            >
              <span className="text-xs font-medium text-accent">0{i + 1}</span>
              <h2 className="mt-2 text-base font-medium text-ink">{s.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">{s.desc}</p>
            </div>
          ))}
        </section>

        <section className="rounded-2xl border border-line bg-surface p-6 shadow-[0_1px_2px_rgba(23,21,15,0.04)] sm:p-8">
          <h2 className="text-lg font-medium text-ink">先填写出生信息</h2>
          <p className="mt-1 text-sm text-ink-3">只需基本信息，用来生成你的时间轴。</p>
          <div className="mt-6">
            <BirthForm />
          </div>
        </section>
      </div>
    </main>
  );
}
