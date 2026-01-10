import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Sidebar />
      {/* Main content - no left margin on mobile, with margin on desktop */}
      <main className="lg:ml-64 p-4 pt-16 lg:pt-8 lg:p-8 flex-1">
        {children}
      </main>
      <footer className="lg:ml-64 py-3 lg:py-4 px-4 lg:px-8 border-t border-border text-center">
        <p className="text-xs sm:text-sm text-muted-foreground">
          Desenvolvido por <span className="font-medium text-foreground">Thiago Nicodemos</span> - <span className="text-primary font-semibold">R2D2</span>
        </p>
      </footer>
    </div>
  );
}
