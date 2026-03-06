import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StaffDashbored } from './staff-dashbored';

describe('StaffDashbored', () => {
  let component: StaffDashbored;
  let fixture: ComponentFixture<StaffDashbored>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StaffDashbored]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StaffDashbored);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
