"""End-to-end UI test against the in-browser mock backend.

Run:  python3 -m http.server 5173 --bind 127.0.0.1   (in the repo root)
      python3 tests/e2e.py [--shots DIR]
Requires Playwright for Python and a Chrome/Chromium binary (CHROME env var).
"""
import os, re, sys, json
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('BASE', 'http://127.0.0.1:5173/?mock')
CHROME = os.environ.get('CHROME', '/usr/bin/google-chrome')
SHOTS = sys.argv[sys.argv.index('--shots') + 1] if '--shots' in sys.argv else None
results = []

def step(name):
    def deco(fn):
        def run(*a):
            try:
                pg = globals().get('page')
                if pg is not None:  # isolate steps: close leftover sheets
                    for _ in range(3):
                        if pg.locator('.sheet-wrap').count() == 0:
                            break
                        pg.keyboard.press('Escape')
                        pg.wait_for_timeout(300)
                fn(*a)
                results.append((name, 'ok', ''))
                print('ok  ', name)
            except Exception as e:  # noqa
                results.append((name, 'FAIL', ' | '.join(str(e).splitlines()[:12])[:1200]))
                print('FAIL', name, '->', ' | '.join(str(e).splitlines()[:12])[:1200])
        return run
    return deco

def shot(page, name):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        page.screenshot(path=os.path.join(SHOTS, name + '.png'))

def no_overflow(page, where):
    sw = page.evaluate('document.documentElement.scrollWidth')
    iw = page.evaluate('window.innerWidth')
    assert sw <= iw, f'horizontal overflow on {where}: {sw} > {iw}'

def swipe(page, dx):
    page.evaluate("""(dx) => {
      const el = document.querySelector('#main');
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + 400;
      const mk = (cx) => new Touch({ identifier: 1, target: el, clientX: cx, clientY: y });
      el.dispatchEvent(new TouchEvent('touchstart', { touches: [mk(x)], changedTouches: [mk(x)], bubbles: true }));
      el.dispatchEvent(new TouchEvent('touchmove', { touches: [mk(x + dx / 2)], changedTouches: [mk(x + dx / 2)], bubbles: true }));
      el.dispatchEvent(new TouchEvent('touchmove', { touches: [mk(x + dx)], changedTouches: [mk(x + dx)], bubbles: true }));
      el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [mk(x + dx)], bubbles: true }));
    }""", dx)


def touch_drag(page, src_selector, dst_selector, hold_ms=450, dst_frac=0.5):
    """Long-press on src, then drag to the centre of dst, using real TouchEvents."""
    page.locator(src_selector).first.evaluate("el => el.scrollIntoView({ block: 'center' })")
    src = page.locator(src_selector).first.bounding_box()
    dst = page.locator(dst_selector).first.bounding_box()
    sx, sy = src['x'] + src['width'] / 2, src['y'] + src['height'] / 2
    dx, dy = dst['x'] + dst['width'] / 2, dst['y'] + dst['height'] * dst_frac
    fire = """([type, x, y]) => {
      window.__dragTarget ||= document.elementFromPoint(x, y);
      const el = window.__dragTarget;
      const t = new Touch({ identifier: 7, target: el, clientX: x, clientY: y });
      const ev = new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true });
      el.dispatchEvent(ev);
      if (type === 'touchend') window.__dragTarget = null;
    }"""
    page.evaluate(fire, ['touchstart', sx, sy])
    page.wait_for_timeout(hold_ms)
    for i in range(1, 11):
        page.evaluate(fire, ['touchmove', sx + (dx - sx) * i / 10, sy + (dy - sy) * i / 10])
        page.wait_for_timeout(16)
    page.evaluate(fire, ['touchend', dx, dy])

def sheet(page):
    return page.locator('.sheet-wrap.is-open .sheet').last

def state(page, expr):
    return page.evaluate(f'(() => {{ const s = window.__dayflow; return {expr}; }})()')

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, headless=True, args=['--no-sandbox', '--disable-background-networking', '--disable-component-update'])
    ctx = browser.new_context(
        viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
        locale='he-IL', timezone_id='Asia/Jerusalem', color_scheme='light',
        user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    )
    external = []
    ctx.route('**/*', lambda r: (external.append(r.request.url), r.abort()) if not r.request.url.startswith('http://127.0.0.1') else r.continue_())
    ctx.set_default_timeout(8000)
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.goto(BASE)
    page.evaluate('localStorage.clear()')
    page.goto(BASE)
    today = page.evaluate("(() => { const d = new Date(); const p = n => String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; })()")

    @step('login screen is RTL Hebrew and blocks wrong credentials')
    def _():
        expect(page.locator('.login-title')).to_have_text('Dayflow')
        assert page.evaluate('document.documentElement.dir') == 'rtl'
        shot(page, '01-login')
        page.get_by_placeholder('שם משתמש').fill('demo')
        page.get_by_placeholder('סיסמה').fill('wrong')
        page.get_by_role('button', name='כניסה', exact=True).click()
        expect(page.locator('.field-error')).to_have_text('שם המשתמש או הסיסמה שגויים.')
    _()

    @step('non-member account is refused')
    def _():
        page.get_by_placeholder('שם משתמש').fill('stranger')
        page.get_by_placeholder('סיסמה').fill('stranger1')
        page.get_by_role('button', name='כניסה', exact=True).click()
        expect(page.locator('.field-error')).to_have_text('לחשבון הזה אין גישה ל-Dayflow.')
    _()

    @step('login opens today\'s day view with six periods')
    def _():
        page.get_by_placeholder('שם משתמש').fill('demo')
        page.get_by_placeholder('סיסמה').fill('demo1234')
        page.get_by_role('button', name='כניסה', exact=True).click()
        expect(page.locator('.timeline .period')).to_have_count(6)
        expect(page.locator('.badge.is-today')).to_have_text('היום')
        names = page.locator('.period-name').all_inner_texts()
        assert names == ['בוקר', 'לפני הצהריים', 'צהריים', 'אחר הצהריים', 'ערב', 'לילה'], names
        expect(page.locator('.empty-hint')).to_be_visible()
        no_overflow(page, 'day')
        shot(page, '02-day-empty')
    _()

    @step('create activity with a day period only (FAB, a few taps)')
    def _():
        page.locator('.fab').click()
        expect(sheet(page)).to_be_visible()
        page.keyboard.type('עבודה על הפרויקט')
        sheet(page).get_by_role('radio', name='בוקר', exact=True).click()
        sheet(page).get_by_role('radio', name='עבודה', exact=True).click()
        shot(page, '03-create-sheet')
        sheet(page).get_by_role('button', name='הוספה', exact=True).click()
        card = page.locator('.period[data-period="morning"] .card')
        expect(card).to_have_count(1)
        expect(card.locator('.card-title')).to_have_text('עבודה על הפרויקט')
        expect(card.locator('.meta-cat')).to_have_text('עבודה')
    _()

    @step('create activity with exact start and end time')
    def _():
        page.locator('.period[data-period="evening"] .period-head').click()
        page.keyboard.type('חדר כושר')
        sheet(page).get_by_role('button', name='פרטים נוספים', exact=True).click()
        sheet(page).get_by_label('שעת התחלה').fill('18:30')
        sheet(page).get_by_label('שעת סיום').fill('19:45')
        sheet(page).get_by_role('radio', name='כושר', exact=True).click()
        sheet(page).get_by_role('button', name='הוספה', exact=True).click()
        card = page.locator('.period[data-period="evening"] .card')
        expect(card).to_have_count(1)
        expect(card.locator('.meta').first).to_have_text('18:30–19:45')
    _()

    @step('end time before start time is rejected')
    def _():
        page.locator('.fab').click()
        page.keyboard.type('בדיקה')
        sheet(page).get_by_role('button', name='פרטים נוספים', exact=True).click()
        sheet(page).get_by_label('שעת התחלה').fill('20:00')
        sheet(page).get_by_label('שעת סיום').fill('19:00')
        sheet(page).get_by_role('button', name='הוספה', exact=True).click()
        expect(sheet(page).locator('.field-error')).to_be_visible()
        sheet(page).get_by_role('button', name='סגירה', exact=True).click()
        expect(page.locator('.sheet-wrap')).to_have_count(0)
        assert state(page, "[...s.state.activities.values()].filter(a => a.title === 'בדיקה').length") == 0
    _()

    @step('time picks the period automatically')
    def _():
        page.locator('.fab').click()
        page.keyboard.type('ארוחת צהריים')
        sheet(page).get_by_role('button', name='פרטים נוספים', exact=True).click()
        sheet(page).get_by_label('שעת התחלה').fill('13:00')
        sheet(page).get_by_label('שעת התחלה').blur()
        expect(sheet(page).get_by_role('radio', name='צהריים', exact=True)).to_have_attribute('aria-checked', 'true')
        sheet(page).get_by_role('button', name='הוספה', exact=True).click()
        expect(page.locator('.period[data-period="noon"] .card')).to_have_count(1)
    _()

    @step('drag & drop (touch long-press): gym from evening to night, undo')
    def _():
        expect(page.locator('.tip')).to_be_visible()
        touch_drag(page, '.period[data-period="evening"] .card .card-main', '.period[data-period="night"] .period-head')
        expect(page.locator('.period[data-period="night"] .card-title')).to_have_text('חדר כושר')
        expect(page.locator('.period[data-period="evening"] .card')).to_have_count(0)
        expect(page.locator('.toast')).to_contain_text('הועבר ללילה')
        expect(page.locator('.toast')).to_contain_text('השעה המדויקת הוסרה')
        expect(page.locator('.sheet-wrap')).to_have_count(0)  # no edit sheet opened by the drop
        assert state(page, "[...s.state.activities.values()].find(a => a.title === 'חדר כושר').start_time") is None
        expect(page.locator('.tip')).to_have_count(0)  # tip goes away after the first drag
        page.locator('.toast-action').click()
        expect(page.locator('.period[data-period="evening"] .card .meta').first).to_have_text('18:30–19:45')
    _()

    @step('a short tap still opens the card, a quick swipe does not drag')
    def _():
        page.locator('.period[data-period="evening"] .card-main').click()
        expect(sheet(page).locator('.sheet-title')).to_have_text('עריכת פעילות')
        sheet(page).get_by_role('button', name='סגירה', exact=True).click()
        expect(page.locator('.sheet-wrap')).to_have_count(0)
        touch_drag(page, '.period[data-period="evening"] .card .card-main', '.period[data-period="night"] .period-head', hold_ms=60)
        expect(page.locator('.period[data-period="evening"] .card')).to_have_count(1)
    _()

    @step('drag & drop with the mouse: morning card to noon and back')
    def _():
        page.locator('.period[data-period="morning"] .card-main').evaluate("el => el.scrollIntoView({ block: 'center' })")
        src = page.locator('.period[data-period="morning"] .card-main').bounding_box()
        dst = page.locator('.period[data-period="noon"] .period-head').bounding_box()
        page.mouse.move(src['x'] + 40, src['y'] + 20)
        page.mouse.down()
        page.mouse.move(src['x'] + 40, src['y'] + 60, steps=4)
        expect(page.locator('.drag-ghost')).to_have_count(1)
        page.mouse.move(dst['x'] + 100, dst['y'] + 20, steps=10)
        expect(page.locator('.period[data-period="noon"]')).to_have_class(re.compile('is-drop-target'))
        shot(page, '14-dragging')
        page.mouse.up()
        expect(page.locator('.period[data-period="noon"] .card-title').filter(has_text='עבודה על הפרויקט')).to_have_count(1)
        expect(page.locator('.sheet-wrap')).to_have_count(0)
        expect(page.locator('.drag-ghost')).to_have_count(0)
        page.locator('.toast-action').click()
        expect(page.locator('.period[data-period="morning"] .card-title')).to_have_text('עבודה על הפרויקט')
    _()

    @step('reorder inside a part of the day (mouse): package before gym, survives reload')
    def _():
        for title in ['חדר כושר', 'לאסוף חבילה']:
            head = page.locator('.period[data-period="afternoon"] .period-head')
            add = page.locator('.period[data-period="afternoon"] .period-add')
            (add if page.locator('.period[data-period="afternoon"] .card').count() else head).click()
            page.keyboard.type(title)
            sheet(page).get_by_role('button', name='הוספה', exact=True).click()
            expect(page.locator('.sheet-wrap')).to_have_count(0)
        cards = page.locator('.period[data-period="afternoon"] .card-title')
        expect(cards).to_have_text(['חדר כושר', 'לאסוף חבילה'])
        src_l = page.locator('.period[data-period="afternoon"] .card-main').nth(1)
        src_l.evaluate("el => el.scrollIntoView({ block: 'center' })")
        src = src_l.bounding_box()
        first = page.locator('.period[data-period="afternoon"] .card').first.bounding_box()
        page.mouse.move(src['x'] + 60, src['y'] + 20)
        page.mouse.down()
        page.mouse.move(src['x'] + 60, src['y'] + 10, steps=3)
        page.mouse.move(first['x'] + 60, first['y'] + 8, steps=8)
        expect(page.locator('.drop-line')).to_be_visible()
        shot(page, '16-reorder')
        page.mouse.up()
        expect(page.locator('.drop-line')).to_have_count(0)
        expect(cards).to_have_text(['לאסוף חבילה', 'חדר כושר'])
        expect(page.locator('.sheet-wrap')).to_have_count(0)
        page.wait_for_function('window.__dayflow.pending === 0')
        page.reload()
        expect(page.locator('.period[data-period="afternoon"] .card-title')).to_have_text(['לאסוף חבילה', 'חדר כושר'])
    _()

    @step('reorder with touch long-press: gym back to the top')
    def _():
        touch_drag(page, '.period[data-period="afternoon"] .card:nth-of-type(2) .card-main', '.period[data-period="afternoon"] .card', dst_frac=0.25)
        expect(page.locator('.period[data-period="afternoon"] .card-title')).to_have_text(['חדר כושר', 'לאסוף חבילה'])
    _()

    @step('all-day and multi-day activity')
    def _():
        page.locator('.fab').click()
        page.keyboard.type('טיול בצפון')
        sheet(page).get_by_role('radio', name='כל היום', exact=True).click()
        sheet(page).get_by_role('button', name='פרטים נוספים', exact=True).click()
        end = page.evaluate("(t) => { const d = new Date(t); d.setDate(d.getDate() + 2); const p = n => String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; }", today + 'T12:00')
        sheet(page).locator('input[aria-label="תאריך סיום"]').fill(end)
        sheet(page).get_by_role('button', name='הוספה', exact=True).click()
        group = page.locator('.day > .group').first
        expect(group.locator('.group-title')).to_have_text('לאורך היום')
        expect(group.locator('.card-title')).to_have_text('טיול בצפון')
        expect(group.locator('.meta').first).to_have_text('יום 1 מתוך 3')
        shot(page, '04-day-filled')
        no_overflow(page, 'day filled')
    _()

    @step('recurring on chosen weekdays (Sun, Tue, Fri) from the main form')
    def _():
        page.locator('.period[data-period="night"] .period-head').click()
        page.keyboard.type('ריצה')
        sheet(page).get_by_role('radio', name='ימים בשבוע', exact=True).click()
        expect(sheet(page).get_by_text('באילו ימים?')).to_be_visible()
        # Sun, Tue, Fri (+ today, so later steps find it on today's page)
        wd = page.evaluate("new Date().getDay()")
        target = sorted({0, 2, 5, wd})
        letters = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']
        for i in range(7):
            btn = sheet(page).get_by_role('button', name=f'יום {letters[i]}', exact=True)
            if (btn.get_attribute('aria-pressed') == 'true') != (i in target):
                btn.click()
        shot(page, '15-repeat-weekdays')
        sheet(page).get_by_role('button', name='הוספה', exact=True).click()
        days = state(page, "[...s.state.activities.values()].find(a => a.title === 'ריצה').repeat_weekdays")
        assert days == target, days
        # check the next 7 days: present exactly on Sun, Tue, Fri
        seen = page.evaluate("""() => { const s = window.__dayflow; const out = [];
          for (let i = 0; i < 7; i++) { const d = new Date(); d.setDate(d.getDate() + i);
            const p = n => String(n).padStart(2, '0'); const k = `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
            if (s.instancesOn(k).some(x => x.a.title === 'ריצה')) out.push(d.getDay()); }
          return out.sort(); }""")
        assert seen == target, seen
        expect(page.locator('.card').filter(has_text='ריצה').locator('.meta').filter(has_text='בימים')).to_have_text('בימים ' + ' '.join(letters[i] for i in target))
    _()

    @step('week view shows the recurring days')
    def _():
        page.get_by_role('radio', name='שבוע', exact=True).click()
        page.locator('.nav-btns').get_by_role('button', name='השבוע הבא', exact=True).click()
        titles = page.locator('.week-day').evaluate_all("els => els.map(e => [...e.querySelectorAll('.agenda-title')].some(t => t.textContent.includes('ריצה')))")
        wd = page.evaluate("new Date().getDay()")
        assert titles == [i in {0, 2, 5, wd} for i in range(7)], titles
        page.get_by_role('radio', name='יום', exact=True).click()
        page.locator('.nav-btns').get_by_role('button', name='היום', exact=True).click()
    _()

    @step('activity cards have no completion control (tasks keep theirs)')
    def _():
        expect(page.locator('.card .check')).to_have_count(0)
        expect(page.locator('.card [role="checkbox"]')).to_have_count(0)
        page.locator('.period[data-period="morning"] .card-main').click()
        expect(sheet(page).get_by_role('button', name='סימון כבוצע', exact=True)).to_have_count(0)
        expect(sheet(page).locator('.quick-btn')).to_have_count(2)
        sheet(page).get_by_role('button', name='סגירה', exact=True).click()
        expect(page.locator('.sheet-wrap')).to_have_count(0)
    _()

    @step('edit an activity and change its period')
    def _():
        page.locator('.period[data-period="morning"] .card-main').click()
        expect(sheet(page).locator('.sheet-title')).to_have_text('עריכת פעילות')
        title = sheet(page).locator('.input-title')
        title.fill('עבודה — ישיבת צוות')
        sheet(page).get_by_role('radio', name='לפני הצהריים', exact=True).click()
        sheet(page).get_by_role('button', name='שמירה', exact=True).click()
        expect(page.locator('.period[data-period="morning"] .card')).to_have_count(0)
        expect(page.locator('.period[data-period="late_morning"] .card-title')).to_have_text('עבודה — ישיבת צוות')
    _()

    @step('recurring edit asks for scope; "only this" detaches the occurrence')
    def _():
        page.locator('.period[data-period="night"] .card-main').click()
        sheet(page).locator('.input-title').fill('ריצה קלה')
        sheet(page).get_by_role('button', name='שמירה', exact=True).click()
        expect(sheet(page).locator('.sheet-title')).to_have_text('פעילות חוזרת')
        sheet(page).get_by_role('button', name='רק למופע הזה', exact=True).click()
        expect(page.locator('.period[data-period="night"] .card-title')).to_have_text('ריצה קלה')
        n = state(page, "[...s.state.activities.values()].filter(a => a.title === 'ריצה' && a.repeat_freq === 'weekly').length")
        assert n == 1, n
    _()

    @step('move an activity to tomorrow')
    def _():
        page.locator('.period[data-period="noon"] .card-main').click()
        sheet(page).get_by_role('button', name='העברה ליום הבא', exact=True).click()
        expect(page.locator('.period[data-period="noon"] .card')).to_have_count(0)
        expect(page.locator('.toast')).to_contain_text('הועבר')
        page.locator('.toast-action').click()
        expect(page.locator('.badge')).to_have_text('מחר')
        expect(page.locator('.period[data-period="noon"] .card-title')).to_have_text('ארוחת צהריים')
        page.locator('.nav-btns').get_by_role('button', name='היום', exact=True).click()
    _()

    @step('swipe between days (RTL: swipe right = next day)')
    def _():
        swipe(page, 160)
        expect(page.locator('.badge')).to_have_text('מחר')
        swipe(page, -160)
        expect(page.locator('.badge.is-today')).to_be_visible()
    _()

    @step('duplicate and delete with undo')
    def _():
        page.locator('.period[data-period="evening"] .card-main').click()
        sheet(page).get_by_role('button', name='שכפול הפעילות', exact=True).click()
        expect(page.locator('.period[data-period="evening"] .card')).to_have_count(2)
        page.locator('.period[data-period="evening"] .card-main').first.click()
        sheet(page).get_by_role('button', name='מחיקה', exact=True).click()
        expect(page.locator('.period[data-period="evening"] .card')).to_have_count(1)
        page.locator('.toast-action').click()
        expect(page.locator('.period[data-period="evening"] .card')).to_have_count(2)
        page.locator('.period[data-period="evening"] .card-main').first.click()
        sheet(page).get_by_role('button', name='מחיקה', exact=True).click()
        expect(page.locator('.period[data-period="evening"] .card')).to_have_count(1)
    _()

    @step('failed save rolls back and shows an error')
    def _():
        before = page.locator('.period[data-period="evening"] .card').count()
        page.locator('.period[data-period="evening"] .card-main').first.click()
        page.evaluate('window.__mockFail = true')
        sheet(page).get_by_role('button', name='שכפול הפעילות', exact=True).click()
        expect(page.locator('.toast.is-error')).to_contain_text('אין חיבור לאינטרנט')
        expect(page.locator('.period[data-period="evening"] .card')).to_have_count(before)
    _()

    @step('tasks: quick add, complete, done filter')
    def _():
        page.locator('.tab[data-tab="tasks"]').click()
        expect(page.locator('.empty-state')).to_be_visible()
        inp = page.get_by_placeholder('משימה חדשה…')
        inp.fill('לקנות מתנה לאמא')
        inp.press('Enter')
        inp.fill('לחדש רישיון')
        inp.press('Enter')
        expect(page.locator('.tasks .task')).to_have_count(2)
        expect(inp).to_be_focused()
        shot(page, '05-tasks')
        page.locator('.tasks .task').filter(has_text='לחדש רישיון').locator('.box').click()
        expect(page.locator('.tasks .task')).to_have_count(1)
        page.get_by_role('radio', name='הושלמו', exact=True).click()
        expect(page.locator('.tasks .task')).to_have_count(1)
        expect(page.locator('.tasks .task-title')).to_have_text('לחדש רישיון')
        page.get_by_role('radio', name='לביצוע', exact=True).click()
        no_overflow(page, 'tasks')
    _()

    @step('schedule a task into today\'s afternoon')
    def _():
        page.locator('.tasks .task-main').filter(has_text='לקנות מתנה').click()
        sheet(page).get_by_role('button', name='היום', exact=True).click()
        sheet(page).get_by_role('radio', name='אחר הצהריים', exact=True).click()
        sheet(page).get_by_role('button', name='שמירה', exact=True).click()
        expect(page.locator('.group-title').filter(has_text='היום')).to_be_visible()
        page.locator('.tab[data-tab="plan"]').click()
        expect(page.locator('.period[data-period="afternoon"] .task-title')).to_have_text('לקנות מתנה לאמא')
    _()

    @step('create a task from the + sheet')
    def _():
        page.locator('.fab').click()
        sheet(page).get_by_role('radio', name='משימה', exact=True).click()
        page.keyboard.type('להתקשר לבנק')
        sheet(page).get_by_role('button', name='הוספה', exact=True).click()
        expect(page.locator('.day > .group .task-title')).to_have_text('להתקשר לבנק')
    _()

    @step('week view keeps the date and lists the week')
    def _():
        page.get_by_role('radio', name='שבוע', exact=True).click()
        expect(page.locator('.week-day')).to_have_count(7)
        expect(page.locator('.strip-day.is-today')).to_have_count(1)
        expect(page.locator('.week-day.is-today .agenda-row').first).to_be_visible()
        no_overflow(page, 'week')
        shot(page, '06-week')
        page.locator('.week-day.is-today .week-day-head').click()
        expect(page.locator('.badge.is-today')).to_be_visible()
    _()

    @step('month view, tap a date opens that day')
    def _():
        page.get_by_role('radio', name='חודש', exact=True).click()
        expect(page.locator('.mcell.is-today')).to_have_count(1)
        assert page.locator('.mcell').count() % 7 == 0
        no_overflow(page, 'month')
        shot(page, '07-month')
        page.locator('.mcell.is-today').click()
        expect(page.locator('.badge.is-today')).to_be_visible()
        assert state(page, 's.state.view') == 'day'
    _()

    @step('data and session persist after reload')
    def _():
        page.reload()
        expect(page.locator('.timeline')).to_be_visible()
        expect(page.locator('.period[data-period="late_morning"] .card-title')).to_have_text('עבודה — ישיבת צוות')
    _()

    @step('categories: add a custom category')
    def _():
        page.locator('.tab[data-tab="settings"]').click()
        page.get_by_role('button', name='קטגוריה חדשה', exact=True).click()
        page.keyboard.type('לימודים')
        sheet(page).get_by_role('radio', name='טורקיז', exact=True).click()
        sheet(page).get_by_role('button', name='הוספת קטגוריה', exact=True).click()
        expect(page.locator('.list-row').filter(has_text='לימודים')).to_be_visible()
        shot(page, '08-settings')
        no_overflow(page, 'settings')
    _()

    @step('dark mode')
    def _():
        page.get_by_role('radio', name='כהה', exact=True).click()
        assert page.evaluate('document.documentElement.dataset.theme') == 'dark'
        page.locator('.tab[data-tab="plan"]').click()
        page.get_by_role('radio', name='יום', exact=True).click()
        shot(page, '09-day-dark')
        page.locator('.period[data-period="evening"] .card-main').click()
        shot(page, '10-edit-sheet-dark')
        sheet(page).get_by_role('button', name='סגירה', exact=True).click()
        page.locator('.tab[data-tab="settings"]').click()
        page.get_by_role('radio', name='אוטומטי', exact=True).click()
    _()

    @step('desktop layout (1280px): sidebar, 7-column week, month with titles')
    def _():
        page.set_viewport_size({'width': 1280, 'height': 860})
        page.locator('.tab[data-tab="plan"]').click()
        page.get_by_role('radio', name='שבוע', exact=True).click()
        expect(page.locator('.brand')).to_be_visible()
        no_overflow(page, 'desktop week')
        shot(page, '11-desktop-week')
        page.get_by_role('radio', name='חודש', exact=True).click()
        expect(page.locator('.mcell.is-today .mitem-text').first).to_be_visible()
        shot(page, '12-desktop-month')
        page.get_by_role('radio', name='יום', exact=True).click()
        shot(page, '13-desktop-day')
        page.set_viewport_size({'width': 390, 'height': 844})
    _()

    @step('sign out returns to the login screen')
    def _():
        page.locator('.tab[data-tab="settings"]').click()
        page.get_by_role('button', name='התנתקות', exact=True).click()
        expect(page.locator('.login-title')).to_be_visible()
    _()

    @step('no console errors, no external requests')
    def _():
        assert not errors, errors
        assert not external, external
    _()

    browser.close()

failed = [r for r in results if r[1] != 'ok']
print(f'\n{len(results) - len(failed)}/{len(results)} passed')
sys.exit(1 if failed else 0)
