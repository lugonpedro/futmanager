-- The online fantasy game is turned off (pesquisa/13-draft-online.md): its
-- schedules stop. Its tables stay for now; dropping them is a separate step.

select cron.unschedule(jobname)
from cron.job
where jobname in ('fantasy-round', 'fantasy-notify-mercado', 'fantasy-notify-rodada');
