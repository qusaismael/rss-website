const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const inline = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(source => source.includes('// Mobile menu toggle'));
assert.ok(inline, 'inline script exists');

function classList() {
  const values = new Set();
  return {
    add(value) { values.add(value); },
    remove(value) { values.delete(value); },
    toggle(value) { if (values.has(value)) { values.delete(value); return false; } values.add(value); return true; },
    contains(value) { return values.has(value); }
  };
}

test('closed mobile menu has semantic control and hidden state', () => {
  assert.ok(/id="mobileMenuBtn"[^>]*aria-controls="mobileMenu"/.test(html), 'menu button names its controlled panel');
  assert.ok(/id="mobileMenu"[^>]*\bhidden\b/.test(html), 'menu panel starts hidden from keyboard');
  assert.ok(/\.mobile-menu\[hidden\]\s*\{\s*display:\s*none;\s*\}/.test(html), 'hidden attribute wins over open styles');
});

test('FAQ buttons control panels and hide closed answers', () => {
  function pair() {
    const icon = { style: {} };
    const button = { attrs: { 'aria-expanded': 'false' },
      setAttribute(name, value) { this.attrs[name] = String(value); },
      getAttribute(name) { return this.attrs[name]; },
      querySelector() { return icon; } };
    const answer = { id: '', hidden: false, style: {}, scrollHeight: 80,
      previousElementSibling: button };
    button.nextElementSibling = answer;
    return { button, answer };
  }
  const first = pair();
  const second = pair();
  const answers = [first.answer, second.answer];
  const doc = { querySelectorAll(selector) {
    assert.ok(['#faq .faq-answer', '.faq-answer'].includes(selector));
    return answers;
  } };
  const script = inline.split('// FAQ accordion toggle')[1]?.split('// Add animation on scroll')[0];
  assert.ok(script, 'FAQ handler section exists');
  const toggle = vm.runInNewContext(script + '\n toggleFaq', { document: doc });
  assert.equal(first.button.attrs['aria-controls'], first.answer.id);
  assert.ok(first.answer.id.startsWith('faq-answer-'));
  assert.equal(first.answer.hidden, true);
  assert.equal(second.answer.hidden, true);
  toggle(first.button);
  assert.equal(first.button.attrs['aria-expanded'], 'true');
  assert.equal(first.answer.hidden, false);
  toggle(second.button);
  assert.equal(first.answer.hidden, true);
  assert.equal(first.button.attrs['aria-expanded'], 'false');
  assert.equal(second.answer.hidden, false);
  toggle(second.button);
  assert.equal(second.answer.hidden, true);
  assert.equal(second.button.attrs['aria-expanded'], 'false');
});

test('reduced motion disables animation and anchor smooth scrolling', () => {
  assert.ok(/@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(html), 'reduce-motion styles exist');
  assert.ok(/animation:\s*none\s*!important/.test(html), 'animations are disabled');
  assert.ok(/scroll-behavior:\s*auto\s*!important/.test(html), 'document scroll is instant');
  const section = inline.split('// Smooth scroll for anchor links')[1]?.split('// Scroll progress bar')[0];
  assert.ok(section, 'anchor scroll handler exists');
  const observed = [];
  const target = { scrollIntoView(options) { observed.push(options.behavior); } };
  const anchor = { addEventListener(type, handler) { this.handler = handler; }, getAttribute() { return '#faq'; } };
  const doc = { querySelectorAll() { return [anchor]; }, querySelector() { return target; } };
  for (const reduce of [false, true]) {
    vm.runInNewContext(section, { document: doc, matchMedia: () => ({ matches: reduce }) });
    anchor.handler.call(anchor, { preventDefault() {} });
  }
  assert.deepEqual(observed, ['smooth', 'instant']);
});

test('Tailwind utilities are a committed local stylesheet, not a runtime CDN', () => {
  assert.ok(html.includes('<link rel="stylesheet" href="./assets/tailwind.css">'), 'local stylesheet is linked');
  assert.ok(!html.includes('cdn.tailwindcss.com'), 'runtime CDN is removed');
  const stylesheet = path.join(__dirname, '../assets/tailwind.css');
  assert.ok(fs.existsSync(stylesheet), 'generated CSS exists on static hosts');
  const css = fs.readFileSync(stylesheet, 'utf8');
  assert.ok(css.includes('.bg-gray-950{'), 'background utility is compiled');
  assert.ok(css.includes('.text-gray-100{'), 'foreground utility is compiled');
  assert.ok(css.includes('.md\\:flex{'), 'responsive utility is compiled');
});

test('mobile menu becomes keyboard-reachable only while expanded', () => {
  const menu = { classList: classList(), hidden: true };
  const icon = { textContent: '☰' };
  const button = { events: {}, attributes: {},
    addEventListener(name, callback) { this.events[name] = callback; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    querySelector() { return icon; } };
  const link = { events: {}, addEventListener(name, callback) { this.events[name] = callback; } };
  const doc = { getElementById(id) { return id === 'mobileMenuBtn' ? button : menu; }, querySelectorAll() { return [link]; } };
  const script = inline.split('// Mobile menu toggle')[1]?.split('// Smooth scroll for anchor links')[0];
  assert.ok(script, 'menu handler section exists');
  vm.runInNewContext(script, { document: doc });
  button.events.click();
  assert.equal(button.attributes['aria-expanded'], 'true');
  assert.equal(menu.hidden, false, 'opening removes hidden');
  link.events.click();
  assert.equal(button.attributes['aria-expanded'], 'false');
  assert.equal(menu.hidden, true, 'link close restores hidden');
});
