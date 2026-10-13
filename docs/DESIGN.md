# Design — Estacionamento Dili

Screens are in `docs/screens/` (exported from the Figma file "Parque estacionamento"). Match them closely.
Demonstration data in the screens (names, plates, amounts) is not real.

## Colour tokens

| Token       | Hex       | Use                                                         |
| ----------- | --------- | ----------------------------------------------------------- |
| ink         | `#17181C` | Header bar, main text, dark buttons                         |
| muted       | `#55585F` | Labels, secondary text                                      |
| ground      | `#F4F2EC` | Screen background                                           |
| surface     | `#FFFFFF` | Cards, inputs, bottom nav                                   |
| line        | `#DEDAD0` | Borders, dividers                                           |
| red         | `#A3231B` | Primary buttons, active tab, red copy                       |
| red-soft    | `#F6DEDB` | Selected vehicle type                                       |
| yellow      | `#F2C230` | Brand mark "P", header eyebrow, yellow copy, highlight card |
| yellow-soft | `#FBEFC4` | Info notes                                                  |
| green       | `#1E6B45` | "Ativo", "Pago", success                                    |
| green-soft  | `#DCEFE3` | Status pill fill                                            |
| blue        | `#1F4E9C` | Serial numbers                                              |

## Type

- UI: **Public Sans** (400, 600, 700, 800)
- Plates, serials, times, amounts in lists: **IBM Plex Mono** (500, 600)
- Header title 22–24 / 800; card numbers 32 / 800; body 15; labels 13 / 600

## Components

- Header: ink background, yellow "P" mark, yellow uppercase eyebrow (e.g. `ESTACIONAMENTO · EMISSÃO`), white title
- Bottom tabs: Início · Novo título · Histórico (active = red)
- Primary button: red, white bold text, radius 14, height ≥ 56
- Status pill: green-soft with green dot "Ativo" / "Pago"
- Info note: yellow-soft box with (i) icon
- Copies row: three tiles — Branca (white), Amarela (yellow), Vermelha (red)

## Agent app screens

| File                      | Screen             | Requirements |
| ------------------------- | ------------------ | ------------ |
| 00-login-agente.png       | Entrar             | FR-01–03     |
| 01-inicio.png             | Início (dashboard) | FR-19, FR-13 |
| 02-novo-titulo.png        | Novo título        | FR-06, FR-07 |
| 03-titulo-emitido.png     | Título emitido     | FR-10        |
| 04-registar-saida.png     | Registar saída     | FR-14, FR-15 |
| 05-pagamento-recebido.png | Pagamento recebido | FR-16, FR-17 |
| 06-historico.png          | Histórico          | FR-18        |

## Console screens

| File                         | Screen                      | Requirements                      |
| ---------------------------- | --------------------------- | --------------------------------- |
| 00-login-consola.png         | Entrar                      | FR-04                             |
| 07-console-monitorizacao.png | Monitorização em tempo real | FR-20, FR-21, FR-22, FR-23, FR-24 |

Other console pages (Títulos ativos, Histórico, Pagamentos, Auditoria, Admin) follow the same layout: left menu, page title with eyebrow, filters row, white cards, tables.
