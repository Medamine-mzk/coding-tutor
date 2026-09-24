import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TestRunner } from "@/components/TestRunner";
import type { TestCase } from "@/lib/exercise/types";
import type { TestReport } from "@/lib/runners/LanguageRunner";

const visible: TestCase[] = [
  { id: "t_vis_1", input: "2 3", expected: "5", kind: "stdout", hidden: false },
  { id: "t_vis_2", input: "0 0", expected: "0", kind: "stdout", hidden: false },
];
const hidden: TestCase[] = [
  { id: "t_hid_1", input: "0 0", stdin: ["0", "0"], expected: "0", kind: "stdout", hidden: true, category: "edge case with zero" },
  { id: "t_hid_2", input: "-5 10", stdin: ["-5", "10"], expected: "5", kind: "stdout", hidden: true, category: "boundary with max" },
];

describe("TestRunner", () => {
  it("renders visible and hidden sections", () => {
    render(<TestRunner tests={[...visible, ...hidden]} report={null} />);
    expect(screen.getByText("Tests visibles")).toBeInTheDocument();
    expect(screen.getByText(/Tests cachés/)).toBeInTheDocument();
    expect(screen.getByTestId("visible-tests")).toBeInTheDocument();
    expect(screen.getByTestId("hidden-tests")).toBeInTheDocument();
  });

  it("shows visible pass/fail with actual vs expected", () => {
    const report: TestReport = {
      passed: 1,
      failed: 1,
      total: 2,
      results: [
        { testId: "t_vis_1", passed: true, actual: "5", expected: "5" },
        { testId: "t_vis_2", passed: false, actual: "999", expected: "0", message: 'Expected "0" got "999"' },
      ],
    };
    render(<TestRunner tests={[...visible, ...hidden]} report={report} />);
    expect(screen.getByText("1/2 passés")).toBeInTheDocument();
    expect(screen.getByTestId("test-t_vis_1")).toHaveTextContent("✓ pass");
    expect(screen.getByTestId("test-t_vis_2")).toHaveTextContent("✗ fail");
    // Visible should show expected and actual
    expect(screen.getByTestId("test-t_vis_2")).toHaveTextContent('Attendu (expected): 0');
    expect(screen.getByTestId("test-t_vis_2")).toHaveTextContent('Obtenu (actual): 999');
  });

  it("never reveals hidden input/expected beyond category", () => {
    const report: TestReport = {
      passed: 1,
      failed: 1,
      total: 2,
      results: [
        { testId: "t_vis_1", passed: true, actual: "5", expected: "5" },
        { testId: "t_hid_1", passed: false, actual: "1", expected: "0" },
      ],
    };
    render(<TestRunner tests={[...visible, ...hidden]} report={report} />);
    const hiddenEl = screen.getByTestId("test-t_hid_1");
    expect(hiddenEl).toHaveTextContent("edge case with zero");
    expect(hiddenEl).not.toHaveTextContent("Expected: 0");
    expect(hiddenEl).not.toHaveTextContent("Input: 0 0");
    // Hidden should show only pass/fail with category
    expect(hiddenEl).toHaveTextContent("✗ fail: edge case with zero");
  });

  it("shows hidden all pass correctly", () => {
    const report: TestReport = {
      passed: 2,
      failed: 0,
      total: 2,
      results: [
        { testId: "t_vis_1", passed: true, actual: "5", expected: "5" },
        { testId: "t_hid_1", passed: true, actual: "0", expected: "0" },
      ],
    };
    render(<TestRunner tests={[visible[0], hidden[0]]} report={report} />);
    expect(screen.getByTestId("test-t_hid_1")).toHaveTextContent("✓ pass");
  });

  it("shows running state", () => {
    render(<TestRunner tests={visible} report={null} running={true} />);
    expect(screen.getByText("Exécution…")).toBeInTheDocument();
  });

  it("hides actual/expected for hidden even when visible fails", () => {
    const report: TestReport = {
      passed: 0,
      failed: 2,
      total: 2,
      results: [
        { testId: "t_hid_1", passed: false, actual: "1", expected: "0" },
        { testId: "t_hid_2", passed: false, actual: "2", expected: "2000" },
      ],
    };
    render(<TestRunner tests={hidden} report={report} />);
    const el1 = screen.getByTestId("test-t_hid_1");
    expect(el1.textContent).not.toContain("Attendu");
    expect(screen.getByTestId("test-t_hid_2").textContent).not.toContain("Attendu");
  });
});
