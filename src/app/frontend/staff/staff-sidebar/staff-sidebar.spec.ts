import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StaffSidebar } from './staff-sidebar';

describe('StaffSidebar', () => {
  let component: StaffSidebar;
  let fixture: ComponentFixture<StaffSidebar>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StaffSidebar]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StaffSidebar);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
