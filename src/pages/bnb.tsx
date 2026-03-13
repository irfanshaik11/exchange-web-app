// BNB page disabled — use /pulse?chain=bnb instead
// To re-enable, restore: export { default } from './pulse';

export default function BnbPage() {
  return null;
}

export const getServerSideProps = () => ({ notFound: true as const });
