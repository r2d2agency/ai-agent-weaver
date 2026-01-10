import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getSettings } from '@/lib/api';

interface BrandingContextType {
  systemName: string;
  logoUrl: string;
  iconUrl: string;
  isLoading: boolean;
  refetch: () => Promise<void>;
}

const BrandingContext = createContext<BrandingContextType>({
  systemName: 'WhatsAgent',
  logoUrl: '',
  iconUrl: '',
  isLoading: true,
  refetch: async () => {},
});

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState({
    systemName: 'WhatsAgent',
    logoUrl: '',
    iconUrl: '',
  });
  const [isLoading, setIsLoading] = useState(true);

  const fetchBranding = async () => {
    try {
      const data = await getSettings();
      setBranding({
        systemName: data.system_name || 'WhatsAgent',
        logoUrl: data.logo_url || '',
        iconUrl: data.icon_url || '',
      });
    } catch (error) {
      console.error('Error loading branding:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBranding();
  }, []);

  return (
    <BrandingContext.Provider value={{ 
      ...branding, 
      isLoading,
      refetch: fetchBranding 
    }}>
      {children}
    </BrandingContext.Provider>
  );
}

export const useBranding = () => useContext(BrandingContext);
