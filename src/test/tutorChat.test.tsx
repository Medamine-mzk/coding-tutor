import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n";
import { TutorChat } from "@/components/TutorChat";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function streamResponse(text: string, hintLevel = 1): Response {
  const enc = new TextEncoder();
  const chunks = text.split(/(\s+)/).map((delta) => `data: ${JSON.stringify({ delta, done: false })}\n\n`).join("") + `data: ${JSON.stringify({ delta: "", done: true, hintLevelUsed: hintLevel })}\n\n`;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(enc.encode(chunks));
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "x-hint-level": String(hintLevel) } });
}

describe("TutorChat", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders welcome message and quick actions", () => {
    render(
      <I18nProvider>
        <TutorChat code={'print("hi")'} />
      </I18nProvider>
    );
    expect(screen.getByTestId("tutor-chat")).toBeInTheDocument();
    expect(screen.getByTestId("tutor-messages")).toBeInTheDocument();
    expect(screen.getByTestId("quick-stuck")).toBeInTheDocument();
    expect(screen.getByTestId("quick-explain_error")).toBeInTheDocument();
    expect(screen.getByTestId("tutor-input")).toBeInTheDocument();
  });

  it("sends student message and streams tutor reply", async () => {
    const fetchMock = vi.fn(async () => streamResponse("Bon hint socratique", 1));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <I18nProvider>
        <TutorChat code={'print("hi")'} />
      </I18nProvider>
    );

    const input = screen.getByTestId("tutor-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Je suis bloqué" } });
    fireEvent.click(screen.getByTestId("tutor-send"));

    await waitFor(() => expect(screen.getByText(/Bon hint socratique/)).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/tutor/chat", expect.objectContaining({ method: "POST" }));
    const firstCall = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    const body = JSON.parse(firstCall[1].body) as { studentMessage: string; code: string };
    expect(body.studentMessage).toBe("Je suis bloqué");
    expect(body.code).toBe('print("hi")');
  });

  it("quick action hint escalates level", async () => {
    const fetchMock = vi.fn(async () => streamResponse("Indice niveau 2", 2));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <I18nProvider>
        <TutorChat code="x=1" />
      </I18nProvider>
    );

    fireEvent.click(screen.getByTestId("quick-hint"));
    await waitFor(() => expect(screen.getByText(/Indice niveau 2/)).toBeInTheDocument());
    const firstCall = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    const body2 = JSON.parse(firstCall[1].body) as { quickAction: string; requestedHintLevel: number };
    expect(body2.quickAction).toBe("hint");
    expect(body2.requestedHintLevel).toBe(1);
  });

  it("shows offline message on fetch failure", async () => {
    const fetchMock = vi.fn(async () => { throw new Error("Failed to fetch"); });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <I18nProvider>
        <TutorChat code="x=1" />
      </I18nProvider>
    );

    const input = screen.getByTestId("tutor-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "help" } });
    fireEvent.click(screen.getByTestId("tutor-send"));

    await waitFor(() => expect(screen.getAllByText(/Hors ligne|offline/i).length).toBeGreaterThanOrEqual(1));
    expect(screen.getByText(/Tutor offline\. You can still code/i)).toBeInTheDocument();
  });

  it("chat is dialogue-only: no insert-comment button on tutor messages", async () => {
    const fetchMock = vi.fn(async () => streamResponse("Lis n avec input", 1));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <I18nProvider>
        <TutorChat code="x=1" />
      </I18nProvider>
    );
    // Ni le message de bienvenue ni les réponses n'offrent d'insertion :
    // l'IDE ne reçoit que les indices guidés L1→L5.
    expect(screen.queryAllByTestId("insert-comment").length).toBe(0);
    const input = screen.getByTestId("tutor-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "aide-moi" } });
    fireEvent.click(screen.getByTestId("tutor-send"));
    await waitFor(() => expect(screen.getByText(/Lis n avec input/)).toBeInTheDocument());
    expect(screen.queryAllByTestId("insert-comment").length).toBe(0);
    vi.unstubAllGlobals();
  });

  it("enforces max 1000 chars input via maxLength", () => {
    render(
      <I18nProvider>
        <TutorChat code="x=1" />
      </I18nProvider>
    );
    const input = screen.getByTestId("tutor-input") as HTMLInputElement;
    expect(input.maxLength).toBe(1000);
  });

  it("respects RTL for Arabic locale", () => {
    localStorage.setItem("locale", "ar");
    render(
      <I18nProvider>
        <TutorChat code="x=1" />
      </I18nProvider>
    );
    // I18nProvider sets dir=rtl on html, TutorChat inherits
    expect(document.documentElement.dir).toBe("rtl");
  });
});
