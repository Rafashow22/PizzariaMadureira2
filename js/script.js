'use strict';

/* ==========================================================================
   Pizzaria Madureira — Lógica da aplicação
   Módulos: Config, Utils, BusinessHours, Cart, Menu, Delivery, Pix, Timer,
   Checkout, CepLookup, Confirmation, WhatsApp, UI (modais/toast),
   Animations, App (bootstrap)
   ========================================================================== */

/* ==========================================================================
   CONFIG — dados configuráveis pelo lojista
   ========================================================================== */

const CONFIG = {
  whatsappNumber: '5521966281152', // formato: 55 + DDD + número, sem símbolos
  instagramUrl: 'https://www.instagram.com/reidapizzamadureira/',
  // Horário de funcionamento por dia da semana (0 = domingo ... 6 = sábado).
  // close: 0 significa que o expediente vai até a meia-noite do próprio dia
  // (23:59 ainda aberto, 00:00 já fechado) — ver BusinessHours.isOpen().
  businessHours: {
    0: { open: 16, close: 22 }, // Domingo
    1: { open: 16, close: 22 }, // Segunda-feira
    2: { open: 16, close: 22 }, // Terça-feira
    3: { open: 14, close: 0 }, // Quarta-feira
    4: { open: 14, close: 0 }, // Quinta-feira
    5: { open: 14, close: 0 }, // Sexta-feira
    6: { open: 14, close: 0 }, // Sábado
  },
  store: {
    // Endereço fixo da loja — origem de todas as entregas.
    // Coordenadas já verificadas por geocodificação (ver Delivery.getStoreCoordinates).
    address: 'Estrada do Portela, 277, Madureira, Rio de Janeiro - RJ, Brasil',
    coords: { lat: -22.8710664, lon: -43.3414372 },
  },
  delivery: {
    maxKm: 10,
    tiers: [
      { maxKm: 2, fee: 5.0 },
      { maxKm: 5, fee: 8.0 },
      { maxKm: 8, fee: 12.0 },
      { maxKm: 10, fee: 15.0 },
    ],
  },
  pix: {
    key: 'pizzariamadureira@pix.com.br', // chave PIX configurável
    merchantName: 'PIZZARIA MADUREIRA',
    merchantCity: 'RIO DE JANEIRO',
  },
  paymentTimeoutSeconds: 5 * 60,
  fetchTimeoutMs: 10000,
};

const SIZES = {
  brotinho: { id: 'brotinho', label: 'Brotinho (15cm)', desc: 'Serve 1 pessoa', price: 7.0 },
  familia: { id: 'familia', label: 'Família (30cm)', desc: 'Serve de 3 a 4', price: 14.0 },
};

const PAYMENT_METHODS = {
  pix: 'PIX',
  credit_card_delivery: 'Cartão de crédito na entrega',
  debit_card_delivery: 'Cartão de débito na entrega',
};

const WEEKDAY_NAMES = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

const PRODUCTS = [
  {
    id: 'frango-catupiry',
    name: 'Frango com Catupiry',
    desc: 'Frango desfiado suculento com o cremoso Catupiry original.',
    img: 'assets/img/FrangoCatupiry.png',
  },
  {
    id: 'calabresa',
    name: 'Calabresa',
    desc: 'Calabresa fatiada e um toque de orégano.',
    img: 'assets/img/Calabresa.png',
  },
  {
    id: 'quatro-queijos',
    name: '4 Queijos',
    desc: 'Mussarela, provolone, parmesão e catupiry em camadas generosas.',
    img: 'assets/img/4queijos.png',
  },
  {
    id: 'bacon',
    name: 'Bacon',
    desc: 'Bacon crocante sobre muito queijo derretido.',
    img: 'assets/img/Bacon.png',
  },
  {
    id: 'alho-torrado',
    name: 'Alho Torrado',
    desc: 'Mussarela coberta com lâminas de alho torrado na manteiga.',
    img: 'assets/img/AlhoTorrado.png',
  },
  {
    id: 'mussarela',
    name: 'Mussarela',
    desc: 'A clássica: muita mussarela e molho de tomate artesanal.',
    img: 'assets/img/AlhoTorrado.png',
  },
  {
    id: 'queijo-presunto',
    name: 'Queijo com Presunto',
    desc: 'Presunto fatiado e mussarela derretida na medida certa.',
    img: 'assets/img/QueijocomPresunto.png',
  },
  {
    id: 'provolone',
    name: 'Provolone',
    desc: 'Provolone defumado com um toque de orégano fresco.',
    img: 'assets/img/Provolone.png',
  },
  {
    id: 'calabresa-cheddar',
    name: 'Calabresa com Cheddar',
    desc: 'Calabresa suculenta com cobertura cremosa de cheddar.',
    img: 'assets/img/CalabresacomCheddar.png',
  },
  {
    id: 'chocolate',
    name: 'Chocolate',
    desc: 'Pizza doce com chocolate ao leite derretido, perfeita pra sobremesa.',
    img: 'assets/img/Chocolate.png',
  },
];

/* ==========================================================================
   STATE — estado mutável da aplicação
   ========================================================================== */

const state = {
  storeOpen: false,
  selectedSize: {}, // { productId: 'brotinho' | 'familia' }
  cart: [], // { uid, productId, name, img, size, qty }
  isReserved: false, // true enquanto o cronômetro do PIX está ativo
  currentOrder: null,
};

/* ==========================================================================
   UTILS
   ========================================================================== */

const Utils = {
  qs: (sel, ctx = document) => ctx.querySelector(sel),
  qsa: (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel)),

  formatCurrency(value) {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  },

  formatDateTime(date) {
    return date.toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  },

  toRad(deg) {
    return (deg * Math.PI) / 180;
  },

  uid() {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  },

  generateOrderId() {
    return `PED-${Date.now().toString(36).toUpperCase()}`;
  },

  async fetchJson(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.fetchTimeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timeout);
    }
  },

  onlyDigits(str) {
    return (str || '').replace(/\D/g, '');
  },
};

/* ==========================================================================
   HORÁRIO DE FUNCIONAMENTO
   ========================================================================== */

const BusinessHours = {
  hoursForDay(day) {
    return CONFIG.businessHours[day];
  },

  formatHour(hour) {
    return `${String(hour).padStart(2, '0')}:00`;
  },

  isOpen(date = new Date()) {
    const hours = BusinessHours.hoursForDay(date.getDay());
    const hour = date.getHours();
    // close: 0 = fecha à meia-noite do próprio dia (23:59 aberto, 00:00 fechado).
    // A troca de dia da semana já acontece sozinha via date.getDay() nesse instante,
    // então não há limite superior de hora a checar dentro do dia atual.
    if (hours.close === 0) return hour >= hours.open;
    return hour >= hours.open && hour < hours.close;
  },

  // Procura, a partir de hoje, o próximo momento em que a loja abre.
  nextOpening(date = new Date()) {
    for (let offset = 0; offset < 7; offset += 1) {
      const day = (date.getDay() + offset) % 7;
      const hours = BusinessHours.hoursForDay(day);
      const isToday = offset === 0;

      if (!isToday || date.getHours() < hours.open) {
        return { day, open: hours.open, isToday, isTomorrow: offset === 1 };
      }
    }
    return { day: date.getDay(), open: CONFIG.businessHours[date.getDay()].open, isToday: true, isTomorrow: false };
  },

  refresh() {
    const now = new Date();
    const open = BusinessHours.isOpen(now);
    state.storeOpen = open;

    const chip = Utils.qs('#statusChip');
    const text = Utils.qs('#statusText');
    const banner = Utils.qs('#closedBanner');
    const bannerText = Utils.qs('#closedBannerText');

    if (open) {
      const todayHours = BusinessHours.hoursForDay(now.getDay());
      chip.classList.remove('is-closed');
      text.textContent = `Aberto agora · até ${BusinessHours.formatHour(todayHours.close)}`;
      banner.hidden = true;
    } else {
      chip.classList.add('is-closed');
      const next = BusinessHours.nextOpening(now);
      const openTime = BusinessHours.formatHour(next.open);

      if (next.isToday) {
        text.textContent = `Fechado · abre às ${openTime}`;
        bannerText.textContent = `Estamos fechados no momento. Hoje atendemos das ${openTime} às ${BusinessHours.formatHour(BusinessHours.hoursForDay(now.getDay()).close)}.`;
      } else if (next.isTomorrow) {
        text.textContent = `Fechado · abre amanhã às ${openTime}`;
        bannerText.textContent = `Estamos fechados no momento. Nosso próximo atendimento será amanhã a partir das ${openTime}.`;
      } else {
        text.textContent = `Fechado · abre ${WEEKDAY_NAMES[next.day]} às ${openTime}`;
        bannerText.textContent = `Estamos fechados no momento. Nosso próximo atendimento será ${WEEKDAY_NAMES[next.day]} a partir das ${openTime}.`;
      }
      banner.hidden = false;
    }

    Utils.qsa('.add-btn').forEach((btn) => { btn.disabled = !open; });
    Cart.refreshCheckoutAvailability();
  },

  init() {
    BusinessHours.refresh();
    setInterval(BusinessHours.refresh, 30000);
  },
};

/* ==========================================================================
   CARRINHO
   ========================================================================== */

const Cart = {
  add(productId, size) {
    if (!state.storeOpen) return;
    const product = PRODUCTS.find((p) => p.id === productId);
    if (!product) return;

    const existing = state.cart.find((item) => item.productId === productId && item.size === size);
    if (existing) {
      existing.qty += 1;
    } else {
      state.cart.push({
        uid: Utils.uid(),
        productId,
        name: product.name,
        img: product.img,
        size,
        qty: 1,
      });
    }

    Cart.persist();
    Cart.render();
    UI.toast(`${product.name} adicionado ao carrinho`);
    Animations.pulseCartFab();
  },

  remove(uid) {
    state.cart = state.cart.filter((item) => item.uid !== uid);
    Cart.persist();
    Cart.render();
  },

  updateQty(uid, delta) {
    const item = state.cart.find((i) => i.uid === uid);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) {
      Cart.remove(uid);
      return;
    }
    Cart.persist();
    Cart.render();
  },

  updateSize(uid, newSize) {
    const item = state.cart.find((i) => i.uid === uid);
    if (!item) return;

    const duplicate = state.cart.find((i) => i.uid !== uid && i.productId === item.productId && i.size === newSize);
    if (duplicate) {
      duplicate.qty += item.qty;
      state.cart = state.cart.filter((i) => i.uid !== uid);
    } else {
      item.size = newSize;
    }
    Cart.persist();
    Cart.render();
  },

  clear() {
    state.cart = [];
    Cart.persist();
    Cart.render();
  },

  getSubtotal() {
    return state.cart.reduce((sum, item) => sum + SIZES[item.size].price * item.qty, 0);
  },

  getItemCount() {
    return state.cart.reduce((sum, item) => sum + item.qty, 0);
  },

  persist() {
    try {
      localStorage.setItem('pizzaria_cart', JSON.stringify(state.cart));
    } catch (e) { /* localStorage indisponível — segue sem persistência */ }
  },

  restore() {
    try {
      const raw = localStorage.getItem('pizzaria_cart');
      if (raw) state.cart = JSON.parse(raw);
    } catch (e) { state.cart = []; }
  },

  refreshCheckoutAvailability() {
    const btn = Utils.qs('#checkoutBtn');
    btn.disabled = !state.storeOpen || state.cart.length === 0 || state.isReserved;
  },

  render() {
    const container = Utils.qs('#cartItems');
    const empty = Utils.qs('#cartEmpty');
    const count = Utils.qs('#cartCount');
    const total = Utils.qs('#cartTotal');
    const subtotalEl = Utils.qs('#cartSubtotal');

    Utils.qsa('.cart-item', container).forEach((el) => el.remove());

    const subtotal = Cart.getSubtotal();
    const itemCount = Cart.getItemCount();

    empty.hidden = state.cart.length > 0;

    state.cart.forEach((item) => {
      const line = document.createElement('div');
      line.className = 'cart-item';
      line.dataset.uid = item.uid;
      line.innerHTML = `
        <img class="cart-item__img" src="${item.img}" alt="${item.name}">
        <div>
          <p class="cart-item__name">${item.name}</p>
          <select class="cart-item__size-select" aria-label="Tamanho">
            <option value="brotinho" ${item.size === 'brotinho' ? 'selected' : ''}>${SIZES.brotinho.label} — ${Utils.formatCurrency(SIZES.brotinho.price)}</option>
            <option value="familia" ${item.size === 'familia' ? 'selected' : ''}>${SIZES.familia.label} — ${Utils.formatCurrency(SIZES.familia.price)}</option>
          </select>
          <div class="cart-item__controls">
            <div class="qty-stepper">
              <button type="button" class="qty-minus" aria-label="Diminuir quantidade">−</button>
              <span class="qty-stepper__value">${item.qty}</span>
              <button type="button" class="qty-plus" aria-label="Aumentar quantidade">+</button>
            </div>
            <button type="button" class="cart-item__remove" aria-label="Remover item">
              <svg viewBox="0 0 24 24" class="icon"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h10l1-13"/></svg>
            </button>
          </div>
        </div>
        <div class="cart-item__price">${Utils.formatCurrency(SIZES[item.size].price * item.qty)}</div>
      `;
      container.appendChild(line);

      line.querySelector('.qty-minus').addEventListener('click', () => Cart.updateQty(item.uid, -1));
      line.querySelector('.qty-plus').addEventListener('click', () => Cart.updateQty(item.uid, 1));
      line.querySelector('.cart-item__remove').addEventListener('click', () => Cart.remove(item.uid));
      line.querySelector('.cart-item__size-select').addEventListener('change', (e) => Cart.updateSize(item.uid, e.target.value));
    });

    count.textContent = itemCount;
    total.textContent = Utils.formatCurrency(subtotal);
    subtotalEl.textContent = Utils.formatCurrency(subtotal);

    Cart.refreshCheckoutAvailability();
  },
};

/* ==========================================================================
   CARDÁPIO (renderização)
   ========================================================================== */

const Menu = {
  render() {
    const grid = Utils.qs('#menuGrid');
    grid.innerHTML = '';

    PRODUCTS.forEach((product) => {
      state.selectedSize[product.id] = 'brotinho';

      const baseScale = product.id === 'provolone' ? 1.28 : 1;
      const imageClass = product.id === 'provolone' ? 'pizza-card__image img-provolone' : 'pizza-card__image';

      const card = document.createElement('article');
      card.className = 'pizza-card';
      card.dataset.productId = product.id;
      card.innerHTML = `
        <div class="pizza-card__media">
          <img class="${imageClass}" data-base-scale="${baseScale}" src="${product.img}" alt="Pizza ${product.name}" loading="lazy">
        </div>
        <div class="pizza-card__body">
          <h3 class="pizza-card__name">${product.name}</h3>
          <p class="pizza-card__desc">${product.desc}</p>
          <div class="size-toggle" role="group" aria-label="Escolha o tamanho">
            <button type="button" class="size-toggle__btn is-active" data-size="brotinho">
              ${SIZES.brotinho.label} <span>${SIZES.brotinho.desc}</span>
            </button>
            <button type="button" class="size-toggle__btn" data-size="familia">
              ${SIZES.familia.label} <span>${SIZES.familia.desc}</span>
            </button>
          </div>
          <div class="pizza-card__footer">
            <div class="pizza-card__price">
              <span class="price-value">${Utils.formatCurrency(SIZES.brotinho.price)}</span>
              <small>preço do tamanho</small>
            </div>
            <button type="button" class="add-btn" ${state.storeOpen ? '' : 'disabled'}>Adicionar</button>
          </div>
        </div>
      `;
      grid.appendChild(card);

      const sizeButtons = Utils.qsa('.size-toggle__btn', card);
      const priceEl = Utils.qs('.price-value', card);

      sizeButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          sizeButtons.forEach((b) => b.classList.remove('is-active'));
          btn.classList.add('is-active');
          const size = btn.dataset.size;
          state.selectedSize[product.id] = size;
          priceEl.textContent = Utils.formatCurrency(SIZES[size].price);
        });
      });

      Utils.qs('.add-btn', card).addEventListener('click', () => {
        Cart.add(product.id, state.selectedSize[product.id]);
      });
    });

    Animations.revealMenuCards();
    Animations.bindCardHover();
  },
};

/* ==========================================================================
   ENTREGA — Geocodificação (Nominatim) + Distância (OSRM)
   ========================================================================== */

const Delivery = {
  // Coordenadas da loja resolvidas uma única vez e reaproveitadas depois
  // (a origem é sempre a mesma, não há motivo para geocodificá-la de novo
  // a cada cálculo de entrega).
  storeCoordinatesCache: null,

  // Função central de geocodificação: recebe um endereço em texto livre e
  // devolve { latitude, longitude } ou null se não encontrar. Toda chamada
  // ao Nominatim do módulo de entrega passa por aqui — nada de requisições
  // espalhadas pelo código.
  async geocodeAddress(address) {
    console.log('[DELIVERY] Geocodificando endereço:', address);

    const params = new URLSearchParams({
      format: 'json',
      limit: '1',
      countrycodes: 'br',
      q: address,
    });

    let data;
    try {
      data = await Utils.fetchJson(
        `https://nominatim.openstreetmap.org/search?${params.toString()}`,
        { headers: { Accept: 'application/json' } },
      );
    } catch (err) {
      console.error('[DELIVERY] Falha ao consultar geocodificação:', err.message);
      throw err;
    }

    if (!data || !data.length) {
      console.warn('[DELIVERY] Nenhum resultado de geocodificação para:', address);
      return null;
    }

    const latitude = Number(data[0].lat);
    const longitude = Number(data[0].lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      console.warn('[DELIVERY] Coordenadas retornadas são inválidas:', data[0].lat, data[0].lon);
      return null;
    }

    return { latitude, longitude };
  },

  // Monta o endereço do cliente em texto livre. O bairro é incluído de
  // propósito: o ViaCEP devolve logradouros sem acentuação (ex.: "Rua
  // Parnaiba"), e buscar só pela rua sem o bairro pode casar com uma rua
  // homônima em outro bairro/município completamente diferente. Incluir o
  // bairro resolve essa ambiguidade. O complemento (ex.: "Fundos") NÃO
  // entra aqui — só interessa para geocodificação um endereço localizável.
  buildCustomerAddress(customer, { includeNumber = true } = {}) {
    return [
      customer.endereco,
      includeNumber ? customer.numero : null,
      customer.bairro,
      customer.cidade,
      customer.uf,
      'Brasil',
    ].filter(Boolean).join(', ');
  },

  async getCustomerCoordinates(customer) {
    const fullAddress = Delivery.buildCustomerAddress(customer);
    let coords = await Delivery.geocodeAddress(fullAddress);

    if (!coords) {
      // Muitos logradouros no Brasil não têm numeração mapeada no OSM —
      // tenta novamente sem o número antes de desistir.
      const addressWithoutNumber = Delivery.buildCustomerAddress(customer, { includeNumber: false });
      coords = await Delivery.geocodeAddress(addressWithoutNumber);
    }

    return coords;
  },

  async getStoreCoordinates() {
    if (Delivery.storeCoordinatesCache) return Delivery.storeCoordinatesCache;

    const configured = CONFIG.store.coords;
    if (configured && Number.isFinite(configured.lat) && Number.isFinite(configured.lon)) {
      // Coordenadas já verificadas para o endereço fixo da loja — evita
      // uma geocodificação redundante de uma origem que nunca muda.
      Delivery.storeCoordinatesCache = { latitude: configured.lat, longitude: configured.lon };
      return Delivery.storeCoordinatesCache;
    }

    const coords = await Delivery.geocodeAddress(CONFIG.store.address);
    if (!coords) throw new Error('Coordenadas da loja não encontradas');
    Delivery.storeCoordinatesCache = coords;
    return Delivery.storeCoordinatesCache;
  },

  haversineKm(a, b) {
    const R = 6371;
    const dLat = Utils.toRad(b.latitude - a.latitude);
    const dLon = Utils.toRad(b.longitude - a.longitude);
    const lat1 = Utils.toRad(a.latitude);
    const lat2 = Utils.toRad(b.latitude);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  },

  async routeDistanceKm(origin, dest) {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${origin.longitude},${origin.latitude};${dest.longitude},${dest.latitude}?overview=false`;
      const data = await Utils.fetchJson(url);
      if (data.code === 'Ok' && data.routes && data.routes.length) {
        return data.routes[0].distance / 1000;
      }
      throw new Error('OSRM sem rota');
    } catch (e) {
      console.warn('[DELIVERY] Rota indisponível, usando distância em linha reta (Haversine):', e.message);
      return Delivery.haversineKm(origin, dest);
    }
  },

  getFee(km) {
    const tier = CONFIG.delivery.tiers.find((t) => km <= t.maxKm);
    return tier ? tier.fee : null;
  },

  async calculate(customer) {
    const destAddress = Delivery.buildCustomerAddress(customer);
    console.log('[DELIVERY] Origem:', CONFIG.store.address);
    console.log('[DELIVERY] Destino:', destAddress);

    const storeCoords = await Delivery.getStoreCoordinates();
    console.log('[DELIVERY] Coordenadas da loja:', `${storeCoords.latitude}, ${storeCoords.longitude}`);

    const customerCoords = await Delivery.getCustomerCoordinates(customer);
    if (!customerCoords) {
      console.log('[DELIVERY] Endereço do cliente não encontrado.');
      return { status: 'not-found' };
    }
    console.log('[DELIVERY] Coordenadas do cliente:', `${customerCoords.latitude}, ${customerCoords.longitude}`);

    const distanceKm = await Delivery.routeDistanceKm(storeCoords, customerCoords);
    console.log('[DELIVERY] Distância calculada:', `${distanceKm.toFixed(2)} km`);
    console.log('[DELIVERY] Limite:', `${CONFIG.delivery.maxKm} km`);

    const isWithinDeliveryArea = distanceKm <= CONFIG.delivery.maxKm;
    console.log('[DELIVERY] Dentro da área:', isWithinDeliveryArea);

    if (!isWithinDeliveryArea) {
      return { status: 'out-of-range', km: distanceKm };
    }

    const fee = Delivery.getFee(distanceKm);
    return { status: 'ok', km: distanceKm, fee };
  },
};

/* ==========================================================================
   PIX — payload BR Code (EMV) + QR Code
   ========================================================================== */

const Pix = {
  crc16(payload) {
    let crc = 0xffff;
    for (let i = 0; i < payload.length; i += 1) {
      crc ^= payload.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j += 1) {
        crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  },

  tlv(id, value) {
    const len = String(value.length).padStart(2, '0');
    return `${id}${len}${value}`;
  },

  sanitize(str, maxLen) {
    const combiningMarks = new RegExp('[̀-ͯ]', 'g');
    return (str || '')
      .normalize('NFD').replace(combiningMarks, '')
      .replace(/[^A-Za-z0-9 ]/g, '')
      .trim()
      .substring(0, maxLen);
  },

  buildPayload({ amount, txid }) {
    const merchantAccount = Pix.tlv('00', 'br.gov.bcb.pix') + Pix.tlv('01', CONFIG.pix.key);
    const gui = Pix.tlv('26', merchantAccount);
    const mcc = Pix.tlv('52', '0000');
    const currency = Pix.tlv('53', '986');
    const value = Pix.tlv('54', amount.toFixed(2));
    const country = Pix.tlv('58', 'BR');
    const name = Pix.tlv('59', Pix.sanitize(CONFIG.pix.merchantName, 25) || 'PIZZARIA');
    const city = Pix.tlv('60', Pix.sanitize(CONFIG.pix.merchantCity, 15) || 'RIO DE JANEIRO');
    const refLabel = Pix.sanitize(txid, 25) || '***';
    const addData = Pix.tlv('62', Pix.tlv('05', refLabel));

    const payloadFormat = Pix.tlv('00', '01');
    const poiMethod = Pix.tlv('01', '12');

    const payloadWithoutCrc = `${payloadFormat}${poiMethod}${gui}${mcc}${currency}${value}${country}${name}${city}${addData}6304`;
    const crc = Pix.crc16(payloadWithoutCrc);
    return payloadWithoutCrc + crc;
  },

  buildQrImageUrl(payload) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=8&data=${encodeURIComponent(payload)}`;
  },
};

/* ==========================================================================
   TIMER — cronômetro de pagamento (5 minutos)
   ========================================================================== */

const Timer = {
  intervalId: null,
  deadline: null,

  start(seconds, onTick, onExpire) {
    Timer.clear();
    Timer.deadline = Date.now() + seconds * 1000;
    onTick(seconds);
    Timer.intervalId = setInterval(() => {
      const remaining = Math.max(0, Math.round((Timer.deadline - Date.now()) / 1000));
      onTick(remaining);
      if (remaining <= 0) {
        Timer.clear();
        onExpire();
      }
    }, 250);
  },

  clear() {
    if (Timer.intervalId) clearInterval(Timer.intervalId);
    Timer.intervalId = null;
  },
};

/* ==========================================================================
   VALIDAÇÃO + MÁSCARAS
   ========================================================================== */

const Validation = {
  maskPhone(value) {
    const v = Utils.onlyDigits(value).slice(0, 11);
    if (v.length > 10) return v.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    if (v.length > 6) return v.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
    if (v.length > 2) return v.replace(/(\d{2})(\d{0,5})/, '($1) $2');
    if (v.length > 0) return v.replace(/(\d{0,2})/, '($1');
    return v;
  },

  maskCep(value) {
    const v = Utils.onlyDigits(value).slice(0, 8);
    if (v.length > 5) return v.replace(/(\d{5})(\d{0,3})/, '$1-$2');
    return v;
  },

  requiredFields: ['fieldNome', 'fieldTelefone', 'fieldCep', 'fieldEndereco', 'fieldNumero', 'fieldBairro', 'fieldCidade'],

  validateForm() {
    let valid = true;
    let firstInvalid = null;

    Validation.requiredFields.forEach((id) => {
      const input = Utils.qs(`#${id}`);
      const isEmpty = !input.value.trim();
      input.classList.toggle('is-invalid', isEmpty);
      if (isEmpty) {
        valid = false;
        if (!firstInvalid) firstInvalid = input;
      }
    });

    const telefoneDigits = Utils.onlyDigits(Utils.qs('#fieldTelefone').value);
    if (telefoneDigits.length < 10) {
      Utils.qs('#fieldTelefone').classList.add('is-invalid');
      valid = false;
      if (!firstInvalid) firstInvalid = Utils.qs('#fieldTelefone');
    }

    const cepDigits = Utils.onlyDigits(Utils.qs('#fieldCep').value);
    if (cepDigits.length !== 8) {
      Utils.qs('#fieldCep').classList.add('is-invalid');
      valid = false;
      if (!firstInvalid) firstInvalid = Utils.qs('#fieldCep');
    }

    if (firstInvalid) {
      firstInvalid.focus();
      Animations.shake(firstInvalid);
    }

    return valid;
  },

  init() {
    Utils.qs('#fieldTelefone').addEventListener('input', (e) => {
      e.target.value = Validation.maskPhone(e.target.value);
    });
    Utils.qs('#fieldCep').addEventListener('input', (e) => {
      e.target.value = Validation.maskCep(e.target.value);
    });
    Utils.qs('#fieldUf').addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase();
    });
    Utils.qsa('.field input, .field textarea').forEach((input) => {
      input.addEventListener('input', () => input.classList.remove('is-invalid'));
    });
  },
};

/* ==========================================================================
   CEP — preenchimento automático de endereço via ViaCEP
   ========================================================================== */

const CepLookup = {
  debounceTimer: null,
  lastQueriedCep: null,

  setStatus(message, type) {
    const el = Utils.qs('#cepStatus');
    if (!message) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = message;
    el.className = `cep-status${type ? ` is-${type}` : ''}`;
  },

  fillAddress(data) {
    if (data.logradouro) Utils.qs('#fieldEndereco').value = data.logradouro;
    if (data.bairro) Utils.qs('#fieldBairro').value = data.bairro;
    if (data.localidade) Utils.qs('#fieldCidade').value = data.localidade;
    if (data.uf) Utils.qs('#fieldUf').value = data.uf;
    Utils.qsa('.field input', document).forEach((input) => input.classList.remove('is-invalid'));
    Utils.qs('#fieldNumero').focus();
  },

  async lookup(cepDigits) {
    if (cepDigits === CepLookup.lastQueriedCep) return;
    CepLookup.lastQueriedCep = cepDigits;
    CepLookup.setStatus('Consultando endereço...', 'loading');

    try {
      const data = await Utils.fetchJson(`https://viacep.com.br/ws/${cepDigits}/json/`);
      if (!data || data.erro) {
        CepLookup.setStatus('CEP não encontrado. Verifique o número informado.', 'error');
        return;
      }
      CepLookup.fillAddress(data);
      CepLookup.setStatus('');
    } catch (err) {
      CepLookup.setStatus('Não foi possível consultar o CEP agora. Preencha o endereço manualmente.', 'error');
    }
  },

  handleInput(e) {
    const digits = Utils.onlyDigits(e.target.value);
    clearTimeout(CepLookup.debounceTimer);

    if (digits.length !== 8) {
      CepLookup.lastQueriedCep = null;
      CepLookup.setStatus('');
      return;
    }

    CepLookup.debounceTimer = setTimeout(() => CepLookup.lookup(digits), 400);
  },

  reset() {
    clearTimeout(CepLookup.debounceTimer);
    CepLookup.lastQueriedCep = null;
    CepLookup.setStatus('');
  },

  init() {
    Utils.qs('#fieldCep').addEventListener('input', CepLookup.handleInput);
  },
};

/* ==========================================================================
   UI — modais, drawer, toast
   ========================================================================== */

const UI = {
  toastTimeout: null,

  toast(message) {
    const el = Utils.qs('#toast');
    el.textContent = message;
    clearTimeout(UI.toastTimeout);
    gsap.killTweensOf(el);
    gsap.to(el, { opacity: 1, y: 0, duration: 0.35, ease: 'power3.out' });
    UI.toastTimeout = setTimeout(() => {
      gsap.to(el, { opacity: 0, y: 20, duration: 0.35, ease: 'power3.in' });
    }, 2600);
  },

  openCart() {
    const overlay = Utils.qs('#cartOverlay');
    const drawer = Utils.qs('#cartDrawer');
    overlay.hidden = false;
    Utils.qs('#cartFabBtn').setAttribute('aria-expanded', 'true');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    gsap.to(overlay, { opacity: 1, duration: 0.3 });
    gsap.to(drawer, { x: '0%', duration: 0.45, ease: 'power3.out' });
  },

  closeCart() {
    const overlay = Utils.qs('#cartOverlay');
    const drawer = Utils.qs('#cartDrawer');
    Utils.qs('#cartFabBtn').setAttribute('aria-expanded', 'false');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    gsap.to(overlay, { opacity: 0, duration: 0.25, onComplete: () => { overlay.hidden = true; } });
    gsap.to(drawer, { x: '100%', duration: 0.4, ease: 'power3.in' });
  },

  openModal(overlayEl, modalSelector) {
    overlayEl.hidden = false;
    document.body.style.overflow = 'hidden';
    const modal = modalSelector ? Utils.qs(modalSelector, overlayEl) : Utils.qs('.modal', overlayEl);
    gsap.to(overlayEl, { opacity: 1, duration: 0.3 });
    gsap.fromTo(modal, { y: 40, opacity: 0.6 }, { y: 0, opacity: 1, duration: 0.4, ease: 'power3.out' });
  },

  closeModal(overlayEl) {
    const modal = Utils.qs('.modal', overlayEl);
    gsap.to(overlayEl, { opacity: 0, duration: 0.25, onComplete: () => {
      overlayEl.hidden = true;
      document.body.style.overflow = '';
    } });
    if (modal) gsap.to(modal, { y: 30, duration: 0.25 });
  },
};

/* ==========================================================================
   CHECKOUT — orquestra formulário, entrega, pix e confirmação
   ========================================================================== */

const Checkout = {
  deliveryCalculated: false,
  addressFieldIds: ['fieldCep', 'fieldEndereco', 'fieldNumero', 'fieldBairro', 'fieldCidade'],

  open() {
    if (state.isReserved || state.cart.length === 0 || !state.storeOpen) return;
    Checkout.renderSummary();
    Checkout.syncPaymentSelection();
    // renderSummary() já zera a taxa/total exibidos, então qualquer cálculo
    // anterior perde validade visual ao reabrir — reflete isso no status também.
    Checkout.deliveryCalculated = false;
    Checkout.setDeliveryStatus('idle', 'Informe seu endereço para calcular a entrega.');
    UI.closeCart();
    UI.openModal(Utils.qs('#checkoutOverlay'));
  },

  // Se o cliente alterar CEP/endereço/número/bairro/cidade depois de já ter
  // calculado a entrega, o resultado anterior fica obsoleto — invalida a
  // taxa/status exibidos para forçar um novo cálculo explícito.
  invalidateDeliveryCalculation() {
    if (!Checkout.deliveryCalculated) return;
    Checkout.deliveryCalculated = false;
    Checkout.setDeliveryStatus('idle', 'Endereço alterado — clique em "Calcular Entrega e Pagar" para recalcular.');
    const subtotal = Cart.getSubtotal();
    Utils.qs('#summaryDelivery').textContent = 'calcular no envio';
    Utils.qs('#summaryTotal').textContent = Utils.formatCurrency(subtotal);
  },

  bindAddressWatchers() {
    Checkout.addressFieldIds.forEach((id) => {
      Utils.qs(`#${id}`).addEventListener('input', Checkout.invalidateDeliveryCalculation);
    });
  },

  close() {
    UI.closeModal(Utils.qs('#checkoutOverlay'));
  },

  getSelectedPaymentMethod() {
    const checked = Utils.qs('input[name="paymentMethod"]:checked');
    return checked ? checked.value : 'pix';
  },

  syncPaymentSelection() {
    Utils.qsa('input[name="paymentMethod"]').forEach((input) => {
      input.closest('.payment-option').classList.toggle('is-selected', input.checked);
    });
    Utils.qs('#summaryPaymentMethod').textContent = PAYMENT_METHODS[Checkout.getSelectedPaymentMethod()];
  },

  bindPaymentOptions() {
    Utils.qsa('input[name="paymentMethod"]').forEach((input) => {
      input.addEventListener('change', Checkout.syncPaymentSelection);
    });
    Checkout.syncPaymentSelection();
  },

  renderSummary() {
    const itemsEl = Utils.qs('#summaryItems');
    itemsEl.innerHTML = state.cart.map((item) => `
      <div class="order-summary__item">
        <span>${item.qty}x ${item.name} (${SIZES[item.size].label})</span>
        <span>${Utils.formatCurrency(SIZES[item.size].price * item.qty)}</span>
      </div>
    `).join('');

    const subtotal = Cart.getSubtotal();
    Utils.qs('#summarySubtotal').textContent = Utils.formatCurrency(subtotal);
    Utils.qs('#summaryDelivery').textContent = 'calcular no envio';
    Utils.qs('#summaryTotal').textContent = Utils.formatCurrency(subtotal);
  },

  setDeliveryStatus(type, message) {
    const el = Utils.qs('#deliveryStatus');
    el.hidden = false;
    el.className = `delivery-status is-${type}`;
    el.textContent = message;
  },

  async handleSubmit(event) {
    event.preventDefault();
    if (state.isReserved) return;
    if (!Validation.validateForm()) return;

    const btn = Utils.qs('#calcDeliveryBtn');
    btn.disabled = true;
    const originalLabel = btn.textContent;
    btn.textContent = 'Calculando entrega...';

    Checkout.setDeliveryStatus('loading', 'Calculando a distância até seu endereço...');

    const customer = Checkout.collectCustomerData();
    const paymentMethod = Checkout.getSelectedPaymentMethod();

    try {
      const result = await Delivery.calculate(customer);

      if (result.status === 'not-found') {
        Checkout.setDeliveryStatus('error', 'Não conseguimos localizar esse endereço. Confira os dados e tente novamente.');
        btn.disabled = false;
        btn.textContent = originalLabel;
        return;
      }

      if (result.status === 'out-of-range') {
        Checkout.close();
        UI.openModal(Utils.qs('#outOfRangeOverlay'));
        btn.disabled = false;
        btn.textContent = originalLabel;
        return;
      }

      Checkout.setDeliveryStatus('success', `Entrega confirmada · ${result.km.toFixed(1)} km da loja`);
      Checkout.deliveryCalculated = true;

      const subtotal = Cart.getSubtotal();
      const total = subtotal + result.fee;

      Utils.qs('#summaryDelivery').textContent = Utils.formatCurrency(result.fee);
      Utils.qs('#summaryTotal').textContent = Utils.formatCurrency(total);

      const order = {
        id: Utils.generateOrderId(),
        items: state.cart.map((i) => ({ ...i })),
        subtotal,
        deliveryFee: result.fee,
        deliveryKm: result.km,
        total,
        paymentMethod,
        customer,
        createdAt: new Date(),
      };
      state.currentOrder = order;

      btn.disabled = false;
      btn.textContent = originalLabel;

      Checkout.close();

      if (paymentMethod === 'pix') {
        PixPayment.open(order);
      } else {
        Checkout.completeDeliveryPayment(order);
      }
    } catch (err) {
      Checkout.setDeliveryStatus('error', 'Não foi possível calcular a entrega agora. Tente novamente em instantes.');
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  },

  collectCustomerData() {
    return {
      nome: Utils.qs('#fieldNome').value.trim(),
      telefone: Utils.qs('#fieldTelefone').value.trim(),
      cep: Utils.qs('#fieldCep').value.trim(),
      endereco: Utils.qs('#fieldEndereco').value.trim(),
      numero: Utils.qs('#fieldNumero').value.trim(),
      complemento: Utils.qs('#fieldComplemento').value.trim(),
      bairro: Utils.qs('#fieldBairro').value.trim(),
      cidade: Utils.qs('#fieldCidade').value.trim(),
      uf: Utils.qs('#fieldUf').value.trim().toUpperCase(),
      observacoes: Utils.qs('#fieldObservacoes').value.trim(),
    };
  },

  // Cartão de crédito/débito na entrega: não há PIX nem cronômetro,
  // o pedido é confirmado direto e o pagamento acontece na entrega.
  completeDeliveryPayment(order) {
    order.confirmedAt = new Date();
    Confirmation.show(order);
    WhatsAppModule.send(order);
    Cart.clear();
  },

  resetForm() {
    Utils.qs('#checkoutForm').reset();
    Utils.qs('#fieldCidade').value = 'Rio de Janeiro';
    Utils.qs('#fieldUf').value = 'RJ';
    Utils.qsa('.field input, .field textarea').forEach((input) => input.classList.remove('is-invalid'));
    Utils.qs('#deliveryStatus').hidden = true;
    Checkout.deliveryCalculated = false;
    Checkout.syncPaymentSelection();
    CepLookup.reset();
  },
};

/* ==========================================================================
   PAGAMENTO PIX
   ========================================================================== */

const PixPayment = {
  open(order) {
    state.isReserved = true;
    Cart.refreshCheckoutAvailability();

    const payload = Pix.buildPayload({ amount: order.total, txid: order.id });
    order.pixPayload = payload;

    Utils.qs('#pixAmount').textContent = Utils.formatCurrency(order.total);
    Utils.qs('#pixQrImg').src = Pix.buildQrImageUrl(payload);
    Utils.qs('#pixCopyPaste').value = payload;

    UI.openModal(Utils.qs('#pixOverlay'));

    Timer.start(
      CONFIG.paymentTimeoutSeconds,
      PixPayment.updateTimerDisplay,
      PixPayment.handleExpire,
    );
  },

  updateTimerDisplay(remainingSeconds) {
    const el = Utils.qs('#pixTimer');
    const m = String(Math.floor(remainingSeconds / 60)).padStart(2, '0');
    const s = String(remainingSeconds % 60).padStart(2, '0');
    el.textContent = `${m}:${s}`;
    el.classList.toggle('is-warning', remainingSeconds <= 30);
  },

  handleExpire() {
    UI.closeModal(Utils.qs('#pixOverlay'));
    state.isReserved = false;
    state.currentOrder = null;
    Cart.refreshCheckoutAvailability();
    UI.openModal(Utils.qs('#expiredOverlay'));
  },

  cancel() {
    Timer.clear();
    UI.closeModal(Utils.qs('#pixOverlay'));
    state.isReserved = false;
    state.currentOrder = null;
    Cart.refreshCheckoutAvailability();
  },

  confirmPayment() {
    Timer.clear();
    UI.closeModal(Utils.qs('#pixOverlay'));

    const order = state.currentOrder;
    order.confirmedAt = new Date();

    Confirmation.show(order);
    WhatsAppModule.send(order);

    state.isReserved = false;
    Cart.clear();
  },

  copyToClipboard() {
    const input = Utils.qs('#pixCopyPaste');
    input.select();
    input.setSelectionRange(0, 99999);
    try {
      navigator.clipboard.writeText(input.value);
    } catch (e) {
      document.execCommand('copy');
    }
    UI.toast('Código PIX copiado');
  },
};

/* ==========================================================================
   CONFIRMAÇÃO
   ========================================================================== */

const Confirmation = {
  show(order) {
    Utils.qs('#confirmOrderId').textContent = order.id;
    Utils.qs('#confirmTime').textContent = Utils.formatDateTime(order.confirmedAt);
    Utils.qs('#confirmPaymentMethod').textContent = PAYMENT_METHODS[order.paymentMethod];
    Utils.qs('#confirmTotalLabel').textContent = order.paymentMethod === 'pix' ? 'Valor pago' : 'Valor a pagar na entrega';
    Utils.qs('#confirmTotal').textContent = Utils.formatCurrency(order.total);

    Utils.qs('#confirmSummary').innerHTML = `
      <div class="order-summary">
        <div class="order-summary__items">
          ${order.items.map((i) => `
            <div class="order-summary__item">
              <span>${i.qty}x ${i.name} (${SIZES[i.size].label})</span>
              <span>${Utils.formatCurrency(SIZES[i.size].price * i.qty)}</span>
            </div>
          `).join('')}
        </div>
        <div class="order-summary__row"><span>Subtotal</span><strong>${Utils.formatCurrency(order.subtotal)}</strong></div>
        <div class="order-summary__row"><span>Entrega</span><strong>${Utils.formatCurrency(order.deliveryFee)}</strong></div>
        <div class="order-summary__row order-summary__row--total"><span>Total</span><strong>${Utils.formatCurrency(order.total)}</strong></div>
      </div>
    `;

    UI.openModal(Utils.qs('#confirmOverlay'));
  },

  close() {
    UI.closeModal(Utils.qs('#confirmOverlay'));
    state.currentOrder = null;
    Checkout.resetForm();
  },
};

/* ==========================================================================
   WHATSAPP — envio do pedido organizado para a pizzaria
   ========================================================================== */

const WhatsAppModule = {
  buildMessage(order) {
    const c = order.customer;

    const lines = [
      '🍕 NOVO PEDIDO - REI DA PIZZA MADUREIRA',
      '',
      '👤 Cliente:',
      c.nome,
      c.telefone,
      '',
      '📍 Endereço:',
      `${c.endereco}, ${c.numero}`,
    ];

    if (c.complemento) lines.push(c.complemento);
    lines.push(c.bairro, `${c.cidade} - ${c.uf}`.trim(), `CEP: ${c.cep}`);

    lines.push('', '🛒 PEDIDO:');
    order.items.forEach((i) => {
      lines.push(`• ${i.qty}x ${i.name} (${SIZES[i.size].label}) — ${Utils.formatCurrency(SIZES[i.size].price * i.qty)}`);
    });

    lines.push(
      '',
      '💰 Subtotal:',
      Utils.formatCurrency(order.subtotal),
      '',
      '🚚 Entrega:',
      Utils.formatCurrency(order.deliveryFee),
      '',
      '💵 TOTAL:',
      Utils.formatCurrency(order.total),
      '',
      '💳 Forma de pagamento:',
      PAYMENT_METHODS[order.paymentMethod],
    );

    if (c.observacoes) {
      lines.push('', '📝 Observações:', c.observacoes);
    }

    lines.push('', `🔖 Número do pedido: ${order.id}`, `🕒 Horário: ${Utils.formatDateTime(order.confirmedAt)}`);

    return lines.join('\n');
  },

  send(order) {
    const message = WhatsAppModule.buildMessage(order);
    const url = `https://wa.me/${CONFIG.whatsappNumber}?text=${encodeURIComponent(message)}`;
    const btn = Utils.qs('#confirmWhatsBtn');
    if (btn) btn.dataset.url = url;
    window.open(url, '_blank', 'noopener');
  },
};

/* ==========================================================================
   ANIMAÇÕES (GSAP + ScrollTrigger)
   ========================================================================== */

const Animations = {
  init() {
    gsap.registerPlugin(ScrollTrigger);

    gsap.from('.header', { y: -30, opacity: 0, duration: 0.6, ease: 'power3.out' });
    gsap.from('.menu__intro > *', {
      y: 24, opacity: 0, duration: 0.7, stagger: 0.1, ease: 'power3.out', delay: 0.15,
    });
  },

  revealMenuCards() {
    const cards = Utils.qsa('.pizza-card');
    cards.forEach((card, index) => {
      gsap.fromTo(card,
        { y: 36, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.6,
          ease: 'power3.out',
          delay: (index % 4) * 0.06,
          scrollTrigger: {
            trigger: card,
            start: 'top 92%',
            once: true,
          },
        });
    });
  },

  bindCardHover() {
    const HOVER_MULTIPLIER = 1.05;
    Utils.qsa('.pizza-card').forEach((card) => {
      const img = Utils.qs('img', card);
      const baseScale = parseFloat(img.dataset.baseScale) || 1;
      card.addEventListener('mouseenter', () => {
        gsap.to(card, { y: -6, duration: 0.35, ease: 'power2.out' });
        gsap.to(img, { scale: baseScale * HOVER_MULTIPLIER, duration: 0.5, ease: 'power2.out' });
      });
      card.addEventListener('mouseleave', () => {
        gsap.to(card, { y: 0, duration: 0.35, ease: 'power2.out' });
        gsap.to(img, { scale: baseScale, duration: 0.5, ease: 'power2.out' });
      });
    });
  },

  pulseCartFab() {
    gsap.fromTo('#cartFabBtn', { scale: 1 }, { scale: 1.14, duration: 0.18, yoyo: true, repeat: 1, ease: 'power1.inOut' });
  },

  shake(el) {
    gsap.fromTo(el, { x: -6 }, { x: 0, duration: 0.4, ease: 'elastic.out(1, 0.3)' });
  },
};

/* ==========================================================================
   BOOTSTRAP DA APLICAÇÃO
   ========================================================================== */

const App = {
  bindEvents() {
    Utils.qs('#cartFabBtn').addEventListener('click', UI.openCart);
    Utils.qs('#cartCloseBtn').addEventListener('click', UI.closeCart);
    Utils.qs('#cartOverlay').addEventListener('click', UI.closeCart);

    Utils.qs('#checkoutBtn').addEventListener('click', Checkout.open);
    Utils.qs('#checkoutCloseBtn').addEventListener('click', Checkout.close);
    Utils.qs('#checkoutForm').addEventListener('submit', Checkout.handleSubmit);

    Utils.qs('#outOfRangeCloseBtn').addEventListener('click', () => {
      UI.closeModal(Utils.qs('#outOfRangeOverlay'));
      UI.openCart();
    });

    Utils.qs('#pixConfirmBtn').addEventListener('click', PixPayment.confirmPayment);
    Utils.qs('#pixCancelBtn').addEventListener('click', PixPayment.cancel);
    Utils.qs('#pixCopyBtn').addEventListener('click', PixPayment.copyToClipboard);

    Utils.qs('#expiredCloseBtn').addEventListener('click', () => {
      UI.closeModal(Utils.qs('#expiredOverlay'));
    });

    Utils.qs('#confirmWhatsBtn').addEventListener('click', (e) => {
      const url = e.currentTarget.dataset.url;
      if (url) window.open(url, '_blank', 'noopener');
    });
    Utils.qs('#confirmCloseBtn').addEventListener('click', Confirmation.close);

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!Utils.qs('#pixOverlay').hidden) return; // não fecha pagamento com ESC
      if (!Utils.qs('#cartOverlay').hidden) UI.closeCart();
      Utils.qsa('.modal-overlay').forEach((overlay) => {
        if (!overlay.hidden && overlay.id !== 'pixOverlay') UI.closeModal(overlay);
      });
    });
  },

  setupFooter() {
    Utils.qs('#year').textContent = new Date().getFullYear();
    const instagramLink = Utils.qs('.footer__social a[aria-label="Instagram"]');
    if (instagramLink) instagramLink.href = CONFIG.instagramUrl;
  },

  init() {
    Cart.restore();
    Menu.render();
    Cart.render();
    BusinessHours.init();
    Validation.init();
    CepLookup.init();
    Animations.init();
    Checkout.bindPaymentOptions();
    Checkout.bindAddressWatchers();
    App.setupFooter();
    App.bindEvents();
  },
};

document.addEventListener('DOMContentLoaded', App.init);
