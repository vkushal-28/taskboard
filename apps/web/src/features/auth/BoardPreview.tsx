interface PreviewCard {
  title: string;
  label: { text: string; className: string };
  people: string[];
  meta?: string;
}

interface PreviewColumn {
  title: string;
  cards: PreviewCard[];
}

const LABELS = {
  design: { text: 'Design', className: 'bg-pink-400/15 text-pink-300' },
  dev: { text: 'Dev', className: 'bg-sky-400/15 text-sky-300' },
  launch: { text: 'Launch', className: 'bg-amber-400/15 text-amber-300' },
};

const COLUMNS: PreviewColumn[] = [
  {
    title: 'To Do',
    cards: [
      {
        title: 'Pricing page copy',
        label: LABELS.launch,
        people: ['bg-amber-400'],
        meta: 'Nov 14',
      },
      { title: 'Onboarding emails', label: LABELS.design, people: ['bg-pink-400'] },
    ],
  },
  {
    title: 'In Progress',
    cards: [
      {
        title: 'Hero illustration',
        label: LABELS.design,
        people: ['bg-pink-400', 'bg-emerald-400'],
        meta: '2/4',
      },
    ],
  },
  {
    title: 'Done',
    cards: [
      { title: 'Auth with refresh tokens', label: LABELS.dev, people: ['bg-sky-400'], meta: '4/4' },
      { title: 'Design system', label: LABELS.design, people: ['bg-violet-400'] },
    ],
  },
];

/** A static, decorative picture of a live board for the sign-in panel. Hidden from screen readers. */
export function BoardPreview() {
  return (
    <div aria-hidden="true" className="relative select-none">
      <div className="absolute -inset-6 rounded-3xl bg-indigo-500/20 blur-3xl" />

      <div className="relative rounded-2xl border border-white/10 bg-white/5 p-4 shadow-2xl backdrop-blur-sm">
        <div className="mb-4 flex items-center gap-3">
          <span className="h-2.5 w-2.5 rounded-full bg-indigo-400" />
          <span className="text-sm font-medium text-white">Website Redesign</span>
          <span className="ml-auto flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2 py-0.5 text-xs text-emerald-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 motion-reduce:animate-none" />
            3 online
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {COLUMNS.map((column) => (
            <div key={column.title} className="rounded-xl bg-slate-950/40 p-2">
              <div className="mb-2 flex items-center justify-between px-1 text-xs font-medium text-slate-400">
                {column.title}
                <span className="text-slate-500">{column.cards.length}</span>
              </div>
              <div className="space-y-2">
                {column.cards.map((card) => (
                  <MiniCard key={card.title} card={card} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* The "someone is moving this" cue from the real board, frozen mid-drag. */}
      <div className="absolute top-[60%] left-[36%] w-[30%] rotate-3 rounded-lg bg-white p-2.5 shadow-2xl ring-2 ring-amber-400">
        <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">
          Dev
        </span>
        <p className="mt-1.5 text-xs font-medium text-slate-800">Live cursor sync</p>
        <p className="mt-1 text-[10px] text-amber-600">Alex is moving this</p>
      </div>
    </div>
  );
}

function MiniCard({ card }: { card: PreviewCard }) {
  return (
    <div className="rounded-lg border border-white/5 bg-slate-800/80 p-2">
      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${card.label.className}`}>
        {card.label.text}
      </span>
      <p className="mt-1.5 text-xs leading-snug text-slate-100">{card.title}</p>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[10px] text-slate-500">{card.meta}</span>
        <div className="flex -space-x-1.5">
          {card.people.map((color) => (
            <span key={color} className={`h-4 w-4 rounded-full ring-2 ring-slate-800 ${color}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
