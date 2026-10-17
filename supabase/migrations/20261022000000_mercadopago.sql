-- The season pass is now sold through Mercado Pago, since Stripe asks for a
-- CNPJ. Passes already paid through Stripe stay valid.

alter table public.fantasy_passes drop constraint fantasy_passes_provider_check;
alter table public.fantasy_passes add constraint fantasy_passes_provider_check
  check (provider in ('stripe', 'mercadopago', 'cortesia'));
