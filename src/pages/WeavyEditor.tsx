import Navbar from "@/components/Navbar";

const WeavyEditor = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="flex-1">
        <iframe
          src="https://app.weavy.ai/flow/dvgEXt4aeShCeokMq5MIpZ"
          className="w-full h-[calc(100vh-64px)] border-0"
          allow="clipboard-read; clipboard-write; fullscreen"
          title="Weavy Flow Editor"
        />
      </div>
    </div>
  );
};

export default WeavyEditor;
