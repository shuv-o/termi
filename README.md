# Termi usage statistics

Updated 2026-11-28 from public download counts. Termi itself sends no data anywhere.
Latest release: v1.2.2

| | Total | Last 7 days | Last 30 days |
| --- | --- | --- | --- |
| Docker pulls, web | 1,164 | +202 | — |
| Docker pulls, gateway | 1,229 | +161 | — |
| Desktop installers downloaded | 187 | +30 | — |
| …macOS Intel | 22 | +1 | — |
| …macOS Apple Silicon | 61 | +4 | — |
| …Windows | 41 | +8 | — |
| …Linux x64 | 50 | +16 | — |
| …Linux arm64 | 13 | +1 | — |
| Desktop update checks | 317 | +58 | — |
| GitHub stars | 10 | +1 | — |
| GitHub forks | 1 | +0 | — |

## GitHub traffic

| | Last 7 days | Last 30 days |
| --- | --- | --- |
| Page views | 58 (15) | 145 (37) |
| Clones | 256 (67) | 2,006 (375) |

In brackets: unique visitors (or cloners) per day, added up.

## Reading these numbers

- **Docker pulls** count every pull, including upgrades and automated scanners, so real deployments are fewer.
- **Desktop update checks** are the closest thing to active desktop installs: each installed Windows or Linux app checks on launch and every 6 hours. Newer macOS apps check GitHub's API instead and aren't counted.
- **Clones** include every CI run, so they overstate interest; unique visitors are the better signal.

History: `history.json` (one snapshot per day), `traffic.json` (daily views and clones).
