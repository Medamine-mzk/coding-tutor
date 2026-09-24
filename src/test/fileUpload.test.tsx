import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n";
import { FileUpload } from "@/components/FileUpload";

describe("FileUpload", () => {
  beforeEach(() => {
    localStorage.setItem("locale", "fr");
    vi.restoreAllMocks();
  });

  it("renders dropzone with correct accept text", () => {
    render(
      <I18nProvider>
        <FileUpload onSingle={vi.fn()} />
      </I18nProvider>
    );
    expect(screen.getByTestId("file-dropzone")).toBeInTheDocument();
    expect(screen.getByTestId("file-input")).toBeInTheDocument();
    expect(screen.getByText(/Glissez un fichier/)).toBeInTheDocument();
  });

  it("rejects over 5MB client-side before upload", async () => {
    const onSingle = vi.fn();
    const onError = vi.fn();
    render(
      <I18nProvider>
        <FileUpload onSingle={onSingle} onError={onError} />
      </I18nProvider>
    );

    const bigFile = new File([new ArrayBuffer(5 * 1024 * 1024 + 1)], "big.pdf", { type: "application/pdf" });
    const input = screen.getByTestId("file-input") as HTMLInputElement;
    // Simulate change
    Object.defineProperty(input, "files", { value: [bigFile] });
    fireEvent.change(input);

    await waitFor(() => expect(screen.getByTestId("file-error")).toBeInTheDocument());
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/5 Mo/i));
    expect(onSingle).not.toHaveBeenCalled();
  });

  it("uploads txt and calls onSingle on success", async () => {
    const exercise = {
      id: "ex_1",
      title: "Somme",
      statement: "somme",
      ioSpec: "io",
      constraints: [],
      examples: [{ input: "2 3", output: "5" }],
      difficulty: 2,
      concepts: ["loops"],
      source: "upload",
      milestones: [],
      visibleTests: [],
      hiddenTests: [],
    };
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ isExercise: true, exercise }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const onSingle = vi.fn();
    render(
      <I18nProvider>
        <FileUpload onSingle={onSingle} />
      </I18nProvider>
    );

    const file = new File(["Écrire un programme somme\nEntrée: 2 3 → Sortie: 5"], "ex.txt", { type: "text/plain" });
    const input = screen.getByTestId("file-input") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file] });
    fireEvent.change(input);

    await waitFor(() => expect(onSingle).toHaveBeenCalledWith(expect.objectContaining({ id: "ex_1" })));
    expect(fetchMock).toHaveBeenCalledWith("/api/exercise/upload", expect.objectContaining({ method: "POST" }));
  });

  it("shows clarification error when file not an exercise", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ isExercise: false, clarification: "Aucun exercice reconnu" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <I18nProvider>
        <FileUpload onSingle={vi.fn()} />
      </I18nProvider>
    );

    const file = new File(["Hello"], "hello.txt", { type: "text/plain" });
    const input = screen.getByTestId("file-input") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file] });
    fireEvent.change(input);

    await waitFor(() => expect(screen.getByTestId("file-error")).toHaveTextContent("Aucun exercice reconnu"));
  });

  it("handles multiple exercises — shows picker and calls onSingle with chosen", async () => {
    const ex1 = { id: "ex1", title: "Somme", examples: [{ input: "2 3", output: "5" }] } as unknown as import("@/lib/exercise/types").Exercise;
    const ex2 = { id: "ex2", title: "Produit", examples: [{ input: "2 3", output: "6" }] } as unknown as import("@/lib/exercise/types").Exercise;
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ isExercise: true, multiple: true, exercises: [ex1, ex2] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const onSingle = vi.fn();
    render(
      <I18nProvider>
        <FileUpload onSingle={onSingle} />
      </I18nProvider>
    );

    const file = new File(["Exercice 1 : Somme\nExercice 2 : Produit"], "multi.txt", { type: "text/plain" });
    const input = screen.getByTestId("file-input") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file] });
    fireEvent.change(input);

    await waitFor(() => expect(screen.getByTestId("multi-picker")).toBeInTheDocument());
    expect(screen.getByText(/2 exercices trouvés/)).toBeInTheDocument();
    // Default selected 0, pick second
    fireEvent.click(screen.getByTestId("multi-radio-1"));
    fireEvent.click(screen.getByTestId("btn-pick-exercise"));
    expect(onSingle).toHaveBeenCalledWith(expect.objectContaining({ id: "ex2" }));
  });

  it("supports drag and drop", async () => {
    const exercise = { id: "ex_drag", title: "Drag", statement: "s", ioSpec: "", constraints: [], examples: [], difficulty: 2, concepts: [], source: "upload", milestones: [], visibleTests: [], hiddenTests: [] } as unknown as import("@/lib/exercise/types").Exercise;
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ isExercise: true, exercise }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const onSingle = vi.fn();
    render(
      <I18nProvider>
        <FileUpload onSingle={onSingle} />
      </I18nProvider>
    );

    const dropzone = screen.getByTestId("file-dropzone");
    const file = new File(["Entrée: 2 3 → Sortie: 5"], "ex.txt", { type: "text/plain" });
    const dataTransfer = { files: [file] } as unknown as DataTransfer;
    fireEvent.dragOver(dropzone);
    fireEvent.drop(dropzone, { dataTransfer });

    await waitFor(() => expect(onSingle).toHaveBeenCalled());
  });

  it("respects RTL for Arabic locale", () => {
    localStorage.setItem("locale", "ar");
    render(
      <I18nProvider>
        <FileUpload onSingle={vi.fn()} />
      </I18nProvider>
    );
    expect(screen.getByTestId("file-dropzone")).toBeInTheDocument();
    expect(document.documentElement.dir).toBe("rtl");
  });
});
