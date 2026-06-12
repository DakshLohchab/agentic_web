const { JSDOM } = require('jsdom');
const dom = new JSDOM(`<!DOCTYPE html><input type="text" id="myInput">`);
const window = dom.window;
const document = dom.window.document;
const el = document.getElementById("myInput");

// Simulate React overriding value getter/setter
let reactState = "";
Object.defineProperty(el, "value", {
  get() { return reactState; },
  set(v) { reactState = v; }
});

const prototype = Object.getPrototypeOf(el);
const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
const prototypeValueGetter = Object.getOwnPropertyDescriptor(prototype, "value")?.get;

// simulate loop
el.addEventListener("input", (e) => {
  // react updates state async or slowly, but for now we won't even update it to simulate batching delay
});

const chars = ["a", "b", "c"];
for (const char of chars) {
  const currentValue = el.value; // React getter
  prototypeValueSetter.call(el, currentValue + char);
  el.dispatchEvent(new window.Event("input"));
}

console.log("Final Native Value:", prototypeValueGetter.call(el));
console.log("Final React Value:", el.value);
