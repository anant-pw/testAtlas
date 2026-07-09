// jsdom doesn't implement ResizeObserver, but recharts' <ResponsiveContainer>
// requires one to measure its container — without this stub, any test that
// mounts a chart-bearing page throws "ResizeObserver is not defined".
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

global.ResizeObserver = ResizeObserverStub;
