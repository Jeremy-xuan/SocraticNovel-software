import { useAppStore } from '../stores/appStore';
import LandingPageInputVariant from './LandingPageInputVariant';
import LandingPageCardVariant from './LandingPageCardVariant';

export default function LandingPage() {
    const { settings } = useAppStore();

    // Default to 'cards' if not explicitly set
    const layout = settings.homeLayout || 'cards';

    // Render the selected layout component
    return layout === 'input' ? <LandingPageInputVariant /> : <LandingPageCardVariant />;
}
