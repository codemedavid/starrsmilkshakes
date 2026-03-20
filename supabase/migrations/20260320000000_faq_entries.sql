-- supabase/migrations/20260320000000_faq_entries.sql
-- FAQ entries for Messenger chatbot keyword-based matching

-- ── Table ────────────────────────────────────────────────────
CREATE TABLE faq_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  keywords TEXT[] NOT NULL,
  category TEXT,
  action_type TEXT NOT NULL DEFAULT 'text',
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_faq_entries_active ON faq_entries (is_active) WHERE is_active = TRUE;

-- ── Auto-update updated_at ──────────────────────────────────
CREATE OR REPLACE FUNCTION update_faq_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_faq_updated_at
  BEFORE UPDATE ON faq_entries
  FOR EACH ROW EXECUTE FUNCTION update_faq_updated_at();

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE faq_entries ENABLE ROW LEVEL SECURITY;

-- No public access — all operations via service role (admin API)

-- ── Seed Data ───────────────────────────────────────────────
INSERT INTO faq_entries (question, answer, keywords, category, action_type, sort_order) VALUES
-- Products (sort_order 1-9)
('What are the most ordered milkshake flavors?',
 'Our most popular flavors are Caramel Cookie Dough, Reeses Overload, Crunchy Cookie Butter, and Strawberry Cheesecake!',
 ARRAY['best seller', 'popular', 'top', 'most ordered', 'recommend', 'recommendation', 'favorite'],
 'products', 'text', 1),

('What are the best milkshake flavors?',
 'Our top milkshake flavors are Caramel Cookie Dough, Reeses Overload, Crunchy Cookie Butter, and Strawberry Cheesecake! Check out our full menu to see all options.',
 ARRAY['flavor', 'flavors', 'milkshake flavor'],
 'products', 'text', 2),

('What are your best sellers?',
 'Our best sellers are Caramel Cookie Dough, Mini Corndog, and Mozzarella Poppers! Would you like to see our full menu?',
 ARRAY['best', 'seller', 'sellers'],
 'products', 'text', 3),

-- Pricing (sort_order 10-19)
('How much is the milkshake?',
 'Prices vary by flavor. Let me show you our menu with all the prices!',
 ARRAY['price', 'how much', 'milkshake', 'cost'],
 'pricing', 'send_menu', 10),

('How much is the snacks?',
 'Here''s our menu with all snack prices!',
 ARRAY['price', 'how much', 'snacks', 'snack', 'food'],
 'pricing', 'send_menu', 11),

-- Ordering (sort_order 20-29)
('Can I order?',
 'Yes! You can order right here or visit our website at starrsmilkshake.com for the best ordering experience. Let me show you our menu and branches!',
 ARRAY['order', 'ordering', 'buy', 'purchase'],
 'ordering', 'text', 20),

('Can I order for pick up?',
 'Yes! You can order for pick up. Let me show you our menu and branches!',
 ARRAY['pick up', 'pickup', 'takeout', 'take out'],
 'ordering', 'text', 21),

('Can I see the menu?',
 'Here you go! Our menu is also available online at starrsmilkshake.com',
 ARRAY['menu', 'see menu', 'show menu', 'view menu'],
 'ordering', 'send_menu', 22),

('How to order?',
 'You can order right here on Messenger, or visit our website at starrsmilkshake.com for the best experience. We are also available on Grab and FoodPanda!',
 ARRAY['how to order', 'how do i order', 'ordering process'],
 'ordering', 'text', 23),

-- Hours (sort_order 30-39)
('Are you open?',
 'Yes! We are open Monday to Sunday. Katipunan: 11AM-9PM, Holy Spirit: 12PM-10PM, Melting Pot: 12PM-10PM.',
 ARRAY['open', 'closed'],
 'hours', 'text', 30),

('What time are you open?',
 E'Our operating hours are:\n• Katipunan Branch: 11:00 AM to 9:00 PM\n• Holy Spirit Branch: 12:00 PM to 10:00 PM\n• Melting Pot Branch: 12:00 PM to 10:00 PM',
 ARRAY['hours', 'time', 'schedule', 'what time', 'when'],
 'hours', 'text', 31),

-- Delivery (sort_order 40-49)
('Do you deliver?',
 'Yes! We deliver fresh, thick, and delicious milkshakes. We service areas deliverable within 20 minutes to guarantee quality. You can also order at starrsmilkshake.com for a smoother experience!',
 ARRAY['deliver', 'delivery', 'ship'],
 'delivery', 'text', 40),

('Will it melt?',
 'We deliver fresh, thick, and delicious milkshakes. We service areas deliverable within 20 minutes to guarantee quality milkshakes!',
 ARRAY['melt', 'melting', 'cold', 'warm'],
 'delivery', 'text', 41),

('Is it free shipping?',
 'Shipping fee depends on your location to our nearest branch. Thank you!',
 ARRAY['free shipping', 'free delivery', 'shipping fee'],
 'delivery', 'text', 42),

('How much is the delivery fee?',
 'Prices are exclusive of shipping fee. The fee depends on your distance to our nearest branch. Visit starrsmilkshake.com for more details and to place your order!',
 ARRAY['delivery fee', 'shipping fee', 'how much delivery'],
 'delivery', 'text', 43),

('How long will food take to prepare?',
 'It''ll be about 15-20 minutes. We''ll let you know when it''s ready!',
 ARRAY['how long', 'prepare', 'preparation', 'wait', 'waiting'],
 'delivery', 'text', 44),

-- Branches (sort_order 50-59)
('Where are your branches?',
 E'Here are our branches:\n\n• Starrs Katipunan: The Xavier Residential — 09564551472\n• Starrs Holy Spirit: Holy Spirit Res. (Surge Fitness), 70 Holy Spirit Dr. Cor. Paraluman — 09457926631\n• Starrs Omega Ave: Melting Pot Bldg, 527 Omega Ave — 09564551474',
 ARRAY['branch', 'location', 'where', 'address', 'store', 'near'],
 'branches', 'send_branches', 50),

-- Discounts (sort_order 60-69)
('Do you offer discount for PWD?',
 'Yes, we offer PWD discounts! Please inform us when placing your order.',
 ARRAY['pwd', 'disability', 'disabled', 'discount'],
 'discounts', 'text', 60),

('Do you offer discount for Senior Citizen?',
 'Yes, we offer Senior Citizen discounts! Please inform us when placing your order.',
 ARRAY['senior', 'senior citizen', 'elderly', 'discount'],
 'discounts', 'text', 61),

-- Partners (sort_order 70-79)
('Are you on FoodPanda and Grab?',
 'Yes! We are on both FoodPanda and Grab. But we have exclusive discounts and better prices for orders on Messenger or our website at starrsmilkshake.com!',
 ARRAY['grab', 'foodpanda', 'panda', 'food panda', 'online partner'],
 'partners', 'text', 70),

-- Franchise (sort_order 80-89)
('Do you franchise?',
 'We are currently working on our franchise manual. We will let you know as soon as we are ready!',
 ARRAY['franchise', 'franchising'],
 'franchise', 'text', 80),

-- Issues (sort_order 90-99)
('My item is marked as delivered but I haven''t received it',
 'We''re sorry to hear that! Please contact the store branch directly for assistance.',
 ARRAY['not received', 'missing', 'lost', 'delivered', 'where is'],
 'issues', 'connect_human', 90),

-- Events (sort_order 100-109)
('Do you cater or have party services?',
 'Yes! We do party and catering services. Would you like to see our party menu? Contact us for more details!',
 ARRAY['party', 'cater', 'catering', 'event', 'birthday', 'celebration'],
 'events', 'text', 100),

('How to reserve for a party?',
 E'Please provide the following details and we''ll check available slots for you:\n• Name\n• Contact Number\n• Email Address\n• Party Location\n• Date\n• Time\n\nWe''ll email you the party proposal. Thank you!',
 ARRAY['reserve', 'reservation', 'book', 'booking'],
 'events', 'text', 101);
