const originalTest = global.test;
const NUM_ITERATIONS = 1;

global.test = (name, fn, timeout) => {
  for (let i = 0; i < NUM_ITERATIONS; i++) {
    originalTest(`${name} (iteration ${i + 1})`, fn, timeout);
  }
};

const originalIt = global.it;

global.it = (name, fn, timeout) => {
  for (let i = 0; i < NUM_ITERATIONS; i++) {
    originalIt(`${name} (iteration ${i + 1})`, fn, timeout);
  }
};
