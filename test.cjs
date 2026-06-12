const { JSDOM } = require('jsdom');
const dom = new JSDOM(`<!DOCTYPE html><input type="text" id="myInput">`);
const window = dom.window;
const document = dom.window.document;
const el = document.getElementById("myInput");

const valueSetter = Object.getOwnPropertyDescriptor(el, "value")?.set;
const prototype = Object.getPrototypeOf(el);
const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

console.log('Instance setter:', !!valueSetter);
console.log('Prototype setter:', !!prototypeValueSetter);

if (!prototypeValueSetter) {
  const p2 = Object.getPrototypeOf(prototype);
  console.log('Parent prototype setter:', !!Object.getOwnPropertyDescriptor(p2, "value")?.set);
}
