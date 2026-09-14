import React from 'react';
import { MENU_GROUPS } from '../partyContent';

type MenuGroup = (typeof MENU_GROUPS)[number];

const MenuGroupCard = ({ group }: { group: MenuGroup }) => (
  <div className={`menu-card${'isFullWidth' in group ? ' full' : ''}`}>
    <div className="menu-card-head">
      <h3>{group.title}</h3>
      {'price' in group && (
        <span className={`menu-price${'isPriceOutlined' in group ? ' outline' : ''}`}>
          {group.price}
        </span>
      )}
    </div>

    {'flavors' in group && <p className="flavors">{group.flavors}</p>}

    {'chips' in group && (
      <div className="munchie-list">
        {group.chips.map((chip) => (
          <span className="munchie-chip" key={chip.name}>
            <span>{chip.name}</span>
            <span>{chip.price}</span>
          </span>
        ))}
      </div>
    )}

    {'note' in group && <p className="note">{group.note}</p>}
  </div>
);

const PartyMenuSection = () => (
  <section id="party-menu">
    <div className="wrap">
      <div className="section-head center">
        <p className="eyebrow">Party Menu</p>
        <h2>Good Shakes, Ready for a Crowd.</h2>
        <p className="lede" style={{ margin: '14px auto 0' }}>
          Everything below is available for cart bookings — pick your favorites or let us build a
          spread for your theme.
        </p>
      </div>

      <div className="menu-groups">
        {MENU_GROUPS.map((group) => (
          <MenuGroupCard group={group} key={group.title} />
        ))}
      </div>
    </div>
  </section>
);

export default PartyMenuSection;
