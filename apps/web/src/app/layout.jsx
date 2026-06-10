import "./globals.css";

export const metadata = {
  title: "M.AI0.1",
  description: "Personal AI assistant"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased" style={{ background: "#050008", color: "#e2e0f0", minHeight: "100vh" }}>
        {children}
      </body>
    </html>
  );
}
