import type {Metadata} from 'next';
import ThemePreview from '@/components/theme-preview/ThemePreview';
import '@/components/theme-preview/theme-preview.css';

export const metadata:Metadata={
 title:'تجربة ثنايا الداكنة | معاينة تصميم فقط',
 description:'مختبر ثنايا لتجربة الألوان الداكنة قبل اعتمادها على المتجر',
 robots:{index:false,follow:false}
};

export default function ThemePreviewPage(){
 return <ThemePreview/>;
}
