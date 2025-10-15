import { FlowsManager } from "../../src/flows";

class TestableFlowsManager extends FlowsManager {
  public validate(
    flows: any[],
    operations: any[]
  ): { errors: string[]; warnings: string[] } {
    return this.validateLocalConfig(flows, operations);
  }
}

describe("FlowsManager validateLocalConfig", () => {
  const manager = new TestableFlowsManager();

  it("flags missing flow identifiers and unknown references", () => {
    const flows = [{ id: "", name: "Broken Flow" }];
    const operations = [{ id: "op-1", flow: "", resolve: null, reject: null }];

    const result = manager.validate(flows as any, operations as any);

    expect(
      result.errors.some((msg) => msg.includes('missing a valid "id"'))
    ).toBe(true);
    expect(
      result.errors.some((msg) => msg.includes("Operation op-1"))
    ).toBe(true);
  });

  it("warns when resolve/reject targets are missing", () => {
    const flows = [{ id: "flow-1", name: "My Flow" }];
    const operations = [
      {
        id: "op-1",
        flow: "flow-1",
        resolve: "op-2",
        reject: null,
      },
    ];

    const result = manager.validate(flows as any, operations as any);

    expect(result.errors).toHaveLength(0);
    expect(
      result.warnings.some((msg) =>
        msg.includes("resolve references missing operation")
      )
    ).toBe(true);
  });

  it("accepts a consistent configuration", () => {
    const flows = [{ id: "flow-1", name: "Valid Flow" }];
    const operations = [
      {
        id: "op-1",
        flow: "flow-1",
        resolve: "op-2",
        reject: null,
      },
      {
        id: "op-2",
        flow: "flow-1",
        resolve: null,
        reject: null,
      },
    ];

    const result = manager.validate(flows as any, operations as any);

    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });
});
