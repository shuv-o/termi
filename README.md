# Termi usage statistics

Updated 2026-11-25 from public download counts. Termi itself sends no data anywhere.
Latest release: v1.2.2

| | Total | Last 7 days | Last 30 days |
| --- | --- | --- | --- |
| Docker pulls, web | 1,110 | +153 | — |
| Docker pulls, gateway | 1,205 | +140 | — |
| Desktop installers downloaded | 172 | +17 | — |
| …macOS Intel | 22 | +1 | — |
| …macOS Apple Silicon | 61 | +5 | — |
| …Windows | 36 | +3 | — |
| …Linux x64 | 40 | +7 | — |
| …Linux arm64 | 13 | +1 | — |
| Desktop update checks | 270 | +13 | — |
| GitHub stars | 9 | +0 | — |
| GitHub forks | 1 | +0 | — |

## GitHub traffic

| | Last 7 days | Last 30 days |
| --- | --- | --- |
| Page views | 56 (12) | 148 (40) |
| Clones | 287 (77) | 1,997 (367) |

In brackets: unique visitors (or cloners) per day, added up.

## Reading these numbers

- **Docker pulls** count every pull, including upgrades and automated scanners, so real deployments are fewer.
- **Desktop update checks** are the closest thing to active desktop installs: each installed Windows or Linux app checks on launch and every 6 hours. Newer macOS apps check GitHub's API instead and aren't counted.
- **Clones** include every CI run, so they overstate interest; unique visitors are the better signal.

History: `history.json` (one snapshot per day), `traffic.json` (daily views and clones).
